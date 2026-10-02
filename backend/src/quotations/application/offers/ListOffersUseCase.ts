import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { VIEW_COMMERCIAL, withActions } from './offerAccess';
import { OfferPage } from './offerViews';
import { IOfferStore, OfferFilters } from './ports/IOfferStore';

/**
 * The offers list (FR-OFR-14): filtered by status, salesperson, company and
 * date, within the viewer's `commercial.view` scope on the deal's
 * salesperson, so a Sales User sees only their own deals' offers. Reception,
 * without the key, gets 403 (FR-RBAC-17).
 */
export class ListOffersUseCase {
  constructor(
    private readonly store: IOfferStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    filters: OfferFilters;
    page: number;
    pageSize: number;
  }): Promise<OfferPage> {
    input.access.ensure(VIEW_COMMERCIAL);
    const scope = await this.scopes.resolve(input.access, VIEW_COMMERCIAL);
    const page = await this.store.list(input.tenantId, scope, input.filters, input.page, input.pageSize);
    return { ...page, data: await withActions(page.data, input.access, this.scopes) };
  }
}
