import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { Percent } from '../../../pricing/domain/Percent';
import { EDIT_OFFERS, withActions } from './offerAccess';
import { actorOf, ensureDealOpen, offerInScope, recordOfferChange } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferDocumentSource } from './ports/IOfferDocumentSource';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

/**
 * DRAFT → READY (FR-OFR-09): a priced offer, within the cap it was priced
 * with, on an open deal. The company, contact, salesperson, Wellness Albania
 * details and texts are frozen into it (D2), so its PDF is final and no longer
 * follows the settings (FR-OFR-04).
 */
export class MarkOfferReadyUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly documents: IOfferDocumentSource,
    private readonly store: IOfferStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; offerId: string }): Promise<OfferView> {
    const { access, tenantId, offerId } = input;
    access.ensure(EDIT_OFFERS);
    const now = this.now();
    await this.writeTx.run(async (repos) => {
      const { offer, deal } = await offerInScope(repos, this.scopes, access, tenantId, offerId);
      ensureDealOpen(deal);
      const props = offer.toProps();
      const details = await this.documents.current(tenantId, {
        clientId: props.clientId,
        contactPersonId: props.contactPersonId,
        salespersonUserId: deal.ownerUserId,
      });
      // The cap the offer was priced with (FR-OFR-04). An approved above-cap
      // discount passes its approval instead (FR-DSC-08): the latest approved
      // one, if it covers this list price and discount. A manual price needs
      // the approval of exactly that price (FR-PRC-09).
      const cap = Percent.of(String(props.ruleSnapshot.discountCapPercent ?? '0'));
      const decided = await repos.approvals.forOffer(tenantId, offerId);
      const approved = decided.map((candidate) => candidate.approvedDiscount).find((candidate) => candidate !== null) ?? null;
      const latestPrice = decided.find((candidate) => candidate.kind === 'MANUAL_PRICE' && candidate.status === 'APPROVED');
      const manualPrice = offer.manualPrice;
      const from = props.status;
      offer.markReady(now, cap, { ...details }, {
        discount: approved ? { listPrice: approved.listPriceAtRequest, approvedPercent: approved.approvedPercent } : undefined,
        manualPriceApproved: manualPrice !== null && (latestPrice?.coversManualPrice(manualPrice.monthlyPrice) ?? false),
      });
      await repos.offers.saveStatus(offer);
      await recordOfferChange(repos, offer, from, actorOf(access));
    });
    const [view] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    return view;
  }
}
