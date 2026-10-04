import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dealLabel } from '../../domain/dealLabel';
import { DealStage } from '../../domain/DealStage';
import { REOPEN_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { dealInScope } from '../dealRules';
import { IDealWriteTransaction } from '../ports/IDealWriteTransaction';
import { GetDealUseCase } from './GetDealUseCase';

/**
 * Reopens a won or lost deal into an open stage (FR-DEAL-17, 18), for
 * `deals.reopen`. The result fields are cleared; the previous result, who
 * reopened it and why stay in the stage history note and the audit trail.
 * The company stays a Client, and rejected offers stay as they were.
 */
export class ReopenDealUseCase {
  constructor(
    private readonly writeTx: IDealWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; stage: DealStage; comment: string }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(REOPEN_DEALS);
    await this.writeTx.run(async ({ deals, auditTrail }) => {
      const deal = await dealInScope(deals, this.scopes, access, REOPEN_DEALS, tenantId, id);
      const before = deal.toProps();
      const change = deal.reopen(input.stage, input.comment, access.userId, new Date(), randomUUID);
      await deals.update(deal);
      await deals.recordChange(tenantId, change);
      const company = await deals.companyName(tenantId, deal.clientId);
      await auditTrail.record({
        tenantId,
        userId: access.userId,
        userRole: access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'Deal',
        entityId: deal.id,
        entityLabel: dealLabel(deal.title, company, deal.type),
        changes: [
          { field: 'stage', old: change.fromStage, new: change.toStage },
          { field: 'comment', old: null, new: input.comment.trim() },
          { field: 'agreedMonthlyPrice', old: before.agreedMonthlyPrice, new: null },
          { field: 'agreedAnnualValue', old: before.agreedAnnualValue, new: null },
          { field: 'lostReasonId', old: before.lostReasonId, new: null },
        ],
      });
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
