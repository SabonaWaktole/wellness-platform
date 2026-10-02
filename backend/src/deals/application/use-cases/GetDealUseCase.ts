import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { DealNotFoundError } from '../../domain/errors';
import { VIEW_DEALS } from '../dealAccess';
import { DealDetail } from '../dealViews';
import { IDealStore } from '../ports/IDealStore';

/** The deal page (FR-DEAL-03): the deal, its company's contacts and its stage history, in the viewer's scope (FR-DEAL-04). */
export class GetDealUseCase {
  constructor(
    private readonly store: IDealStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<DealDetail> {
    input.access.ensure(VIEW_DEALS);
    const deal = await this.store.detail(input.tenantId, input.id, await this.scopes.resolve(input.access, VIEW_DEALS));
    if (!deal) throw new DealNotFoundError();
    return deal;
  }
}
