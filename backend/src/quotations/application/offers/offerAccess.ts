import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits, RecordScope } from '../../../access/domain/RecordScope';
import { EDIT_OFFERS } from '../../../pricing/application/use-cases/ListActivePackagesUseCase';
import { QuotationStatus } from '../../domain/Quotation';
import { OfferAction, OfferView } from './offerViews';

export { EDIT_OFFERS };

/** Reading offers, their figures and their PDF (FR-RBAC-17). Scoped, on the deal's salesperson. */
export const VIEW_COMMERCIAL = 'commercial.view';

/**
 * What a viewer who may (or may not) edit the deal's offers can do with this
 * offer now (FR-OFR-09..12). Mirrors the checks the use cases make, so the
 * screen only offers what the server accepts. Nothing changes on an old
 * version or once the deal is closed.
 */
export function offerActions(offer: OfferView, canEdit: boolean): OfferAction[] {
  if (!canEdit || offer.superseded || !offer.dealOpen) return [];
  switch (offer.status) {
    case QuotationStatus.Draft:
      return offer.listPrice === null ? ['EDIT'] : ['EDIT', 'MARK_READY'];
    case QuotationStatus.Ready:
      return ['EDIT', 'MARK_SENT'];
    case QuotationStatus.Sent:
      return ['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE'];
    default:
      return [];
  }
}

/** The views with `permittedActions` filled for `access`. */
export async function withActions(views: OfferView[], access: AccessContext, scopes: RecordScopeResolver): Promise<OfferView[]> {
  const editScope: RecordScope | null = access.can(EDIT_OFFERS) ? await scopes.resolve(access, EDIT_OFFERS) : null;
  return views.map((view) => ({
    ...view,
    permittedActions: offerActions(view, editScope !== null && admits(editScope, view.dealOwnerUserId)),
  }));
}
