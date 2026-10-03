import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { EDIT_OFFERS, withActions } from './offerAccess';
import { actorOf, ensureDealOpen, offerAuditLabel, offerInScope } from './offerChanges';
import { OfferView } from './offerViews';
import { IOfferStore } from './ports/IOfferStore';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

/**
 * Changing a sent offer (FR-OFR-11): the sent version becomes read-only and
 * stays downloadable, and the next version starts as a draft with the same
 * number and content, to be priced again on the pricing screen, made ready
 * and sent. Returns the new version.
 */
export class ReviseOfferUseCase {
  constructor(
    private readonly writeTx: IOfferWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly store: IOfferStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; offerId: string }): Promise<OfferView> {
    const { access, tenantId, offerId } = input;
    access.ensure(EDIT_OFFERS);
    const now = this.now();
    const nextId = await this.writeTx.run(async (repos) => {
      const { offer, deal } = await offerInScope(repos, this.scopes, access, tenantId, offerId);
      ensureDealOpen(deal);
      const next = offer.reviseInto(randomUUID(), access.userId, now);
      await repos.offers.saveStatus(offer);
      await repos.offers.insert(next);
      const actor = actorOf(access);
      await repos.auditTrail.record({
        tenantId,
        userId: actor.userId,
        userRole: actor.userRole,
        action: AuditAction.Create,
        entityType: 'Offer',
        entityId: next.id,
        entityLabel: await offerAuditLabel(repos, next),
        changes: [
          { field: 'version', old: offer.version, new: next.version },
          { field: 'previousVersionId', old: null, new: offer.id },
        ],
      });
      // The deal's value follows its latest version (FR-DEAL-10, 11).
      const amounts = next.amounts;
      await repos.deals.setOfferValue(tenantId, deal.id, {
        netMonthlyPrice: amounts?.netMonthlyPrice.toString() ?? null,
        annualValue: amounts?.annualValue.toString() ?? null,
      });
      return next.id;
    });
    const [view] = await withActions([(await this.store.find(tenantId, nextId))!], access, this.scopes);
    return view;
  }
}
