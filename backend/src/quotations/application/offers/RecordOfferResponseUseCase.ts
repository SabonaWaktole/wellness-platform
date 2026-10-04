import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { EDIT_DEALS } from '../../../deals/application/dealAccess';
import { EDIT_OFFERS, withActions } from './offerAccess';
import { actorOf, ensureDealOpen, offerInScope, recordOfferChange } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

export const OFFER_RESPONSE_NOTE_MAX = 2000;

/**
 * The company's answer, recorded by the salesperson (FR-OFR-12): a sent
 * offer is marked accepted or rejected, with an optional note kept in its
 * history. Only the latest version can be accepted (FR-OFR-11). Accepting
 * returns `canWinDeal`, so the screen can offer to win the deal (Slice 13).
 */
export class RecordOfferResponseUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly store: IOfferStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    offerId: string;
    response: 'ACCEPTED' | 'REJECTED';
    note: string | null;
  }): Promise<OfferView> {
    const { access, tenantId, offerId } = input;
    access.ensure(EDIT_OFFERS);
    const note = input.note?.trim().slice(0, OFFER_RESPONSE_NOTE_MAX) || null;
    const now = this.now();
    await this.writeTx.run(async (repos) => {
      const { offer, deal } = await offerInScope(repos, this.scopes, access, tenantId, offerId);
      ensureDealOpen(deal);
      const from = offer.status;
      if (input.response === 'ACCEPTED') offer.accept(now);
      else offer.reject(now);
      await repos.offers.saveStatus(offer);
      await recordOfferChange(repos, offer, from, actorOf(access), note);
    });
    const [view] = await withActions([(await this.store.find(tenantId, offerId))!], access, this.scopes);
    // FR-OFR-12: an accepted latest offer on an open deal can win it, for whoever may edit the deal.
    const canWinDeal = input.response === 'ACCEPTED' && view.dealOpen && !view.superseded && access.can(EDIT_DEALS);
    return input.response === 'ACCEPTED' ? { ...view, canWinDeal } : view;
  }
}
