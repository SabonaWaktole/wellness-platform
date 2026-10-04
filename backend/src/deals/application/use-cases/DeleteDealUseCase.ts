import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dealLabel } from '../../domain/dealLabel';
import { DealHasSentOfferError } from '../../domain/errors';
import { DELETE_DEALS } from '../dealAccess';
import { dealInScope } from '../dealRules';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';

/**
 * Soft-deletes a deal (FR-DEAL-19), audited in the same transaction. The
 * deal leaves every list, the board and the company timeline; its row and
 * stage history stay. A deal with an offer marked as sent is refused: what
 * the company was offered stays on record (Slice 9).
 */
export class DeleteDealUseCase {
  constructor(
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<void> {
    const { access, tenantId, id } = input;
    access.ensure(DELETE_DEALS);
    await this.writeTx.run(async ({ deals, auditTrail }) => {
      const deal = await dealInScope(deals, this.scopes, access, DELETE_DEALS, tenantId, id);
      if (await deals.hasSentOffer(tenantId, deal.id)) throw new DealHasSentOfferError();
      deal.softDelete(new Date());
      await deals.update(deal);
      await auditTrail.record({
        tenantId,
        userId: access.userId,
        userRole: access.auditRole,
        action: AuditAction.Delete,
        entityType: 'Deal',
        entityId: deal.id,
        entityLabel: dealLabel(deal.title, await deals.companyName(tenantId, deal.clientId), deal.type),
        changes: [],
      });
    });
  }
}
