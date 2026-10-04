import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { actorOf, recordOfferChange } from '../../../quotations/application/offers/offerChanges';
import { IOfferWriteTransaction } from '../../../quotations/application/offers/ports/IOfferWriteTransaction';
import { DealNotFoundError, InvalidDealError } from '../../domain/errors';
import { EDIT_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { auditDeal, closingDateOf } from './dealClosing';
import { GetDealUseCase } from './GetDealUseCase';

export const DEAL_LOST_REASON = 'Deal lost';

/**
 * Loses a deal for a predefined reason (FR-DEAL-16, 18), in one transaction:
 * the deal's open offers become Rejected and its open follow-ups are
 * cancelled. The reason, note and date are on the deal and in the audit trail.
 */
export class LoseDealUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly getDeal: GetDealUseCase,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    id: string;
    reasonId: string;
    note: string | null;
    closingDate?: Date;
  }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(EDIT_DEALS);
    const now = this.now();
    await this.writeTx.run(async (repos) => {
      const deal = await repos.deals.find(tenantId, id);
      if (!deal || !admits(await this.scopes.resolve(access, EDIT_DEALS), deal.ownerUserId)) throw new DealNotFoundError();
      if (!(await repos.deals.isActiveLostReason(tenantId, input.reasonId))) {
        throw new InvalidDealError('lostReasonId', 'Choose one of the active lost reasons.');
      }
      const closingDate = closingDateOf(input.closingDate, now);
      const change = deal.lose(input.reasonId, input.note, closingDate, access.userId, now, randomUUID);
      await repos.deals.update(deal);
      await repos.deals.recordChange(tenantId, change);

      for (const offer of await repos.offers.openForDeal(tenantId, deal.id)) {
        const from = offer.status;
        offer.rejectForLoss(now);
        await repos.offers.saveStatus(offer);
        await recordOfferChange(repos, offer, from, actorOf(access), DEAL_LOST_REASON);
      }
      const cancelled = await repos.deals.cancelOpenFollowUps(tenantId, deal.id, DEAL_LOST_REASON, now);

      const props = deal.toProps();
      await auditDeal(repos, access, deal, AuditAction.StatusChange, [
        { field: 'stage', old: change.fromStage, new: change.toStage },
        { field: 'closingDate', old: null, new: closingDate.toISOString().slice(0, 10) },
        { field: 'lostReasonId', old: null, new: props.lostReasonId },
        { field: 'lostNote', old: null, new: props.lostNote },
        { field: 'followUpsClosed', old: null, new: cancelled },
      ]);
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
