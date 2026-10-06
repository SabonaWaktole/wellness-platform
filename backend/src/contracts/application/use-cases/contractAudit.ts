import { Contract } from '../../domain/Contract';
import { ContractPayment } from '../../domain/ContractPayment';

/** The contract fields the audit trail cares about (FR-AUD-02). */
export const CONTRACT_AUDIT_FIELDS = [
  'status',
  'planName',
  'amount',
  'billingPeriod',
  'startsAt',
  'endsAt',
  'assignedUserId',
  'notes',
  'renewedFromContractId',
  // M3 Slice 4 (FR-AUD-11): the deal's values and the contract's number and renewal date.
  'number',
  'dealId',
  'quotationId',
  'packageId',
  'agreedAnnualValue',
  'discountPercent',
  'renewalDate',
  // M3 Slice 5 (FR-AUD-11): the reason that goes with a suspension or a cancellation.
  'suspensionReason',
  'cancelReason',
  // M3 Slice 11 (FR-AUD-11): the "Not renewing" mark and its note.
  'notRenewingReasonId',
  'notRenewingNote',
] as const;

/** The payment fields the audit trail cares about (FR-AUD-02). */
export const PAYMENT_AUDIT_FIELDS = [
  'status',
  'dueDate',
  'amount',
  'paidAmount',
  'paidAt',
  'method',
  'note',
  // M3 Slice 8 (FR-AUD-11): the invoice the instalment was billed on.
  'invoiceNumber',
  'invoiceDate',
] as const;

/** A plain-object snapshot of the fields `diff()` compares, for a contract. */
export function contractSnapshot(contract: Contract): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of CONTRACT_AUDIT_FIELDS) {
    snapshot[field] = (contract as unknown as Record<string, unknown>)[field];
  }
  return snapshot;
}

/** A plain-object snapshot of the fields `diff()` compares, for a payment. */
export function paymentSnapshot(payment: ContractPayment): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of PAYMENT_AUDIT_FIELDS) {
    snapshot[field] = (payment as unknown as Record<string, unknown>)[field];
  }
  return snapshot;
}

/** The human-readable label an audit entry carries for a contract. */
export function contractLabel(contract: Contract): string {
  const client = contract.clientName ?? contract.clientId;
  return `${client} — ${contract.number ?? contract.planName}`;
}

/** The human-readable label an audit entry carries for a payment. */
export function paymentLabel(contract: Contract, payment: ContractPayment): string {
  return `${contractLabel(contract)} #${payment.periodIndex}`;
}
