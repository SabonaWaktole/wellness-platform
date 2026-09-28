import { admits, RecordScope } from '../../../access/domain/RecordScope';

/**
 * An invoice belongs to whoever its company belongs to (FR-RBAC-11). One
 * outside the viewer's `invoices.manage` scope is "not found" (FR-RBAC-05).
 */
export const reachableInvoice = <I extends { clientAssignedUserId?: string | null }>(
  invoice: I | null,
  scope: RecordScope
): I => {
  if (!invoice || !admits(scope, invoice.clientAssignedUserId)) {
    throw new Error('Invoice not found');
  }
  return invoice;
};
