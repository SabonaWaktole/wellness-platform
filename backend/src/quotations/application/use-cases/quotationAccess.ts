import { admits, RecordScope } from '../../../access/domain/RecordScope';

/**
 * A quotation belongs to whoever its company belongs to (FR-RBAC-11: "Own"
 * is the user's companies and, later, their offers). One outside the
 * viewer's `quotations.manage` scope is "not found", like one that does not
 * exist (FR-RBAC-05: 404, not 403). `scope` is `null` for a system actor —
 * the expiry job, or a client answering through the public link — which acts
 * on any quotation.
 */
export const reachableQuotation = <Q extends { clientAssignedUserId?: string | null }>(
  quotation: Q | null,
  scope: RecordScope | null
): Q => {
  if (!quotation || (scope && !admits(scope, quotation.clientAssignedUserId))) {
    throw new Error('Quotation not found');
  }
  return quotation;
};
