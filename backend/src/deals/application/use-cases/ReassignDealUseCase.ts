import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dealLabel } from '../../domain/dealLabel';
import { EDIT_DEALS, REASSIGN_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { dealInScope, ensureEligibleOwner } from '../dealRules';
import { IDealStore } from '../ports/IDealStore';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';
import { GetDealUseCase } from './GetDealUseCase';

/**
 * Hands a deal to another salesperson (FR-DEAL-05). Takes
 * `companies.reassign`, and the deal must be one the caller may edit. One
 * audit entry with the old and new salesperson, in the same transaction.
 */
export class ReassignDealUseCase {
  constructor(
    private readonly store: IDealStore,
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; ownerUserId: string }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(REASSIGN_DEALS);
    access.ensure(EDIT_DEALS);
    await this.writeTx.run(async ({ deals, auditTrail }) => {
      const deal = await dealInScope(deals, this.scopes, access, EDIT_DEALS, tenantId, id);
      if (deal.ownerUserId === input.ownerUserId) return;
      await ensureEligibleOwner(this.store, this.scopes, access, REASSIGN_DEALS, tenantId, input.ownerUserId);

      const previous = deal.reassign(input.ownerUserId, new Date());
      await deals.update(deal);
      await auditTrail.record({
        tenantId,
        userId: access.userId,
        userRole: access.auditRole,
        action: AuditAction.Update,
        entityType: 'Deal',
        entityId: deal.id,
        entityLabel: dealLabel(deal.title, await deals.companyName(tenantId, deal.clientId), deal.type),
        changes: [{ field: 'ownerUserId', old: previous, new: input.ownerUserId }],
      });
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
