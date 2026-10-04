import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits, RecordScope } from '../../../access/domain/RecordScope';
import { EDIT_OFFERS } from '../../../pricing/application/use-cases/ListActivePackagesUseCase';
import { QuotationStatus } from '../../domain/Quotation';
import { OfferAction, OfferView } from './offerViews';

export { EDIT_OFFERS };

/** Reading offers, their figures and their PDF (FR-RBAC-17). Scoped, on the deal's salesperson. */
export const VIEW_COMMERCIAL = 'commercial.view';

/** Approving a discount above the cap (FR-DSC-06, 09). Scoped, on the deal's salesperson. */
export const APPROVE_DISCOUNTS = 'discounts.approve';

/**
 * What a viewer who may (or may not) edit the deal's offers can do with this
 * offer now (FR-OFR-09..12, FR-DSC-06, 10). Mirrors the checks the use cases
 * make, so the screen only offers what the server accepts. Nothing changes on
 * an old version or once the deal is closed. A pending offer is decided
 * inline: its approvers see approve/reject, its requester sees withdraw.
 */
export function offerActions(
  offer: OfferView,
  options: { canEdit: boolean; canApprove: boolean; isRequester: boolean }
): OfferAction[] {
  const { canEdit, canApprove, isRequester } = options;
  if (offer.superseded || !offer.dealOpen) return [];
  switch (offer.status) {
    case QuotationStatus.Draft:
      return canEdit ? (offer.listPrice === null ? ['EDIT'] : ['EDIT', 'MARK_READY']) : [];
    case QuotationStatus.PendingApproval: {
      const actions: OfferAction[] = [];
      if (canApprove && !isRequester) actions.push('APPROVE_DISCOUNT', 'REJECT_DISCOUNT');
      if (isRequester && canEdit) actions.push('WITHDRAW_APPROVAL');
      return actions;
    }
    case QuotationStatus.Ready:
      return canEdit ? ['EDIT', 'MARK_SENT'] : [];
    case QuotationStatus.Sent:
      return canEdit ? ['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE'] : [];
    default:
      return [];
  }
}

/** The views with `permittedActions` filled for `access`. */
export async function withActions(views: OfferView[], access: AccessContext, scopes: RecordScopeResolver): Promise<OfferView[]> {
  const editScope: RecordScope | null = access.can(EDIT_OFFERS) ? await scopes.resolve(access, EDIT_OFFERS) : null;
  const approveScope: RecordScope | null = access.can(APPROVE_DISCOUNTS)
    ? await scopes.resolve(access, APPROVE_DISCOUNTS)
    : null;
  return views.map((view) => {
    const canEdit = editScope !== null && admits(editScope, view.dealOwnerUserId);
    const canApprove = approveScope !== null && admits(approveScope, view.dealOwnerUserId);
    const isRequester = view.pendingApproval?.requestedByUserId === access.userId;
    return {
      ...view,
      permittedActions: offerActions(view, { canEdit, canApprove, isRequester }),
    };
  });
}
