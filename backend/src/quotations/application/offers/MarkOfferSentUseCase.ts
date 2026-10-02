import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { DealStage } from '../../../deals/domain/DealStage';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { InvalidSentDateError } from '../../domain/offerErrors';
import { EDIT_OFFERS, withActions } from './offerAccess';
import { actorOf, ensureDealOpen, offerInScope, recordOfferChange } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

/** The validity when an offer predates the setting in its snapshot (FR-PCF-08's default, Q9). */
const DEFAULT_VALIDITY_DAYS = 30;

/**
 * READY → SENT, after the salesperson has emailed the PDF themselves
 * (FR-OFR-07, 10). The date sent defaults to today on the screen; it may not
 * be in the future, nor before the offer was made, in the workspace's time
 * zone. The validity runs from it, for the days the offer was priced with
 * (FR-PCF-08). The deal moves to Offer Sent unless it is already past it
 * (FR-DEAL-08). All in one transaction, with history and audit (FR-OFR-15).
 */
export class MarkOfferSentUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly store: IOfferStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; offerId: string; sentDate: string }): Promise<OfferView> {
    const { access, tenantId, offerId, sentDate } = input;
    access.ensure(EDIT_OFFERS);
    const now = this.now();
    await this.writeTx.run(async (repos) => {
      const { offer, deal } = await offerInScope(repos, this.scopes, access, tenantId, offerId);
      ensureDealOpen(deal);
      const props = offer.toProps();
      const timeZone = await repos.offers.timeZone(tenantId);
      if (sentDate > dayKeyInZone(now, timeZone)) {
        throw new InvalidSentDateError('The date sent cannot be in the future.');
      }
      if (sentDate < dayKeyInZone(props.createdAt, timeZone)) {
        throw new InvalidSentDateError('The date sent cannot be before the offer was made.');
      }
      const days = props.ruleSnapshot.offerValidityDays;
      const from = props.status;
      offer.markSent(sentDate, typeof days === 'number' ? days : DEFAULT_VALIDITY_DAYS, now);
      await repos.offers.saveStatus(offer);
      await recordOfferChange(repos, offer, from, actorOf(access));

      // FR-DEAL-08: never backwards, so a deal in Negotiation stays there.
      const change = deal.advanceAutomatically(DealStage.OfferSent, now, randomUUID);
      if (change) {
        await repos.deals.update(deal);
        await repos.deals.recordChange(tenantId, change);
      }
    });
    const [view] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    return view;
  }
}
