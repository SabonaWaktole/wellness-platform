import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { admits } from '../../../access/domain/RecordScope';
import { QuotationStatus } from '../../../quotations/domain/Quotation';
import { Offer } from '../../../quotations/domain/Offer';
import { actorOf, recordOfferChange } from '../../../quotations/application/offers/offerChanges';
import { IOfferWriteTransaction } from '../../../quotations/application/offers/ports/IOfferWriteTransaction';
import { DealNotFoundError, DealNotWinnableError } from '../../domain/errors';
import { WinningOffer } from '../../domain/Deal';
import { EDIT_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { auditDeal, closingDateOf } from './dealClosing';
import { GetDealUseCase } from './GetDealUseCase';

export const DEAL_WON_REASON = 'Deal won';

/** The offer as the deal reads it: the price comes from the offer, never from the caller (FR-DEAL-14). */
function winningOffer(offer: Offer): WinningOffer {
  const props = offer.toProps();
  return {
    id: props.id,
    dealId: props.dealId,
    status: props.status,
    superseded: offer.isSuperseded,
    hasPendingApproval: props.status === QuotationStatus.PendingApproval,
    netMonthlyPrice: props.amounts?.netMonthlyPrice.toString() ?? null,
    annualValue: props.amounts?.annualValue.toString() ?? null,
    packageId: props.packageId,
  };
}

/**
 * Wins a deal with one of its offers (FR-DEAL-14, 15, FR-OFR-12), in one
 * transaction: the offer becomes Accepted, the deal Won with the agreed
 * values copied from the offer, the company a Client, and, when the
 * salesperson confirmed, the deal's open follow-ups are cancelled. The offer,
 * the deal and the company are each audited (FR-AUD-09).
 */
export class WinDealUseCase {
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
    offerId?: string;
    closingDate?: Date;
    closeFollowUps: boolean;
  }): Promise<DealDetail> {
    const { access, tenantId, id } = input;
    access.ensure(EDIT_DEALS);
    const now = this.now();
    await this.writeTx.run(async (repos) => {
      const deal = await repos.deals.find(tenantId, id);
      if (!deal || !admits(await this.scopes.resolve(access, EDIT_DEALS), deal.ownerUserId)) throw new DealNotFoundError();
      const offer = input.offerId ? await repos.offers.find(tenantId, input.offerId) : await repos.offers.latest(tenantId, id);
      if (!offer || offer.dealId !== deal.id) throw new DealNotWinnableError('The deal has no offer to win with.');
      const closingDate = closingDateOf(input.closingDate, now);

      const change = deal.win(winningOffer(offer), closingDate, access.userId, now, randomUUID);
      const from = offer.status;
      if (offer.acceptForWin(now)) {
        await repos.offers.saveStatus(offer);
        await recordOfferChange(repos, offer, from, actorOf(access), DEAL_WON_REASON);
      }
      await repos.deals.update(deal);
      await repos.deals.recordChange(tenantId, change);

      const company = await repos.deals.makeClient(tenantId, deal.clientId);
      const cancelled = input.closeFollowUps
        ? await repos.deals.cancelOpenFollowUps(tenantId, deal.id, DEAL_WON_REASON, now)
        : 0;

      const props = deal.toProps();
      await auditDeal(repos, access, deal, AuditAction.StatusChange, [
        { field: 'stage', old: change.fromStage, new: change.toStage },
        { field: 'closingDate', old: null, new: closingDate.toISOString().slice(0, 10) },
        { field: 'agreedMonthlyPrice', old: null, new: props.agreedMonthlyPrice },
        { field: 'agreedAnnualValue', old: null, new: props.agreedAnnualValue },
        { field: 'packageId', old: null, new: props.packageId },
        { field: 'wonQuotationId', old: null, new: props.wonQuotationId },
        { field: 'salespersonUserId', old: null, new: props.ownerUserId },
        { field: 'followUpsClosed', old: null, new: cancelled },
      ]);
      if (company && company.previous !== 'CLIENT') {
        await repos.auditTrail.record({
          tenantId,
          userId: access.userId,
          userRole: access.auditRole,
          action: AuditAction.Update,
          entityType: 'Client',
          entityId: deal.clientId,
          entityLabel: company.companyName,
          changes: [{ field: 'status', old: company.previous, new: 'CLIENT' }],
        });
      }
    });
    return this.getDeal.execute({ access, tenantId, id });
  }
}
