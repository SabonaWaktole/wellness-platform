import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { VIEW_COMMERCIAL, VIEW_DEALS } from '../dealAccess';
import { DealSummary } from '../dealViews';
import { DealListFilters, DealSort, IDealStore } from '../ports/IDealStore';

export const DEAL_PAGE_SIZE_MAX = 100;

/**
 * The pipeline as a list (FR-DEAL-11): filtered, sorted and paged in the
 * query, inside the viewer's scope (FR-DEAL-04, FR-RBAC-13), by value too
 * from Slice 8.
 */
export class SearchDealsUseCase {
  constructor(
    private readonly store: IDealStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    filters: DealListFilters;
    sort: DealSort;
    page: number;
    pageSize: number;
  }): Promise<{ items: DealSummary[]; total: number; page: number; pageSize: number }> {
    input.access.ensure(VIEW_DEALS);
    // A value filter or sort would tell a viewer the values it may not see (FR-RBAC-17).
    if (input.filters.valueMin || input.filters.valueMax || input.sort.field === 'value') {
      input.access.ensure(VIEW_COMMERCIAL);
    }
    const pageSize = Math.min(Math.max(input.pageSize, 1), DEAL_PAGE_SIZE_MAX);
    const page = Math.max(input.page, 1);
    const result = await this.store.search(
      input.tenantId,
      await this.scopes.resolve(input.access, VIEW_DEALS),
      input.filters,
      input.sort,
      { skip: (page - 1) * pageSize, take: pageSize }
    );
    return { ...result, page, pageSize };
  }
}
