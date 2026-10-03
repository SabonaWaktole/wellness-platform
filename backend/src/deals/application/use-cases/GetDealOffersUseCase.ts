import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { withActions } from '../../../quotations/application/offers/offerAccess';
import { OfferView } from '../../../quotations/application/offers/offerViews';
import { IOfferStore } from '../../../quotations/application/offers/ports/IOfferStore';
import { VIEW_COMMERCIAL } from '../dealAccess';
import { GetDealUseCase } from './GetDealUseCase';

/**
 * The deal page's offers section (FR-DEAL-03, FR-OFR-01): the deal must be
 * in the viewer's `deals.view` scope (FR-DEAL-04), and its offers are read
 * with `commercial.view`, so Reception, which holds neither, never sees them.
 * Each offer says what this viewer may do with it now (FR-OFR-09).
 */
export class GetDealOffersUseCase {
  constructor(
    private readonly getDeal: GetDealUseCase,
    private readonly offers: IOfferStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<OfferView[]> {
    input.access.ensure(VIEW_COMMERCIAL);
    await this.getDeal.execute(input);
    return withActions(await this.offers.forDeal(input.tenantId, input.id), input.access, this.scopes);
  }
}
