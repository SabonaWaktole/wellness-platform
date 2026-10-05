import { AccessContext } from './AccessContext';

/**
 * The money and percentage field names `commercial.view` guards. Every slice
 * that adds such a field to a response adds its name here (FR-RBAC-17).
 */
export const COMMERCIAL_FIELDS: readonly string[] = [
  // Milestone 1
  'amount', 'price', 'unitPrice', 'lineTotal', 'subtotal', 'grandTotal', 'total', 'revenue',
  // Milestone 2: pricing breakdown, offers, discounts, deals
  'listPrice', 'netMonthlyPrice', 'discountAmount', 'discountPercent', 'baseFee', 'riskFee', 'visitFee',
  'locationFee', 'annualValue', 'pricePerEmployee', 'agreedMonthlyPrice', 'agreedAnnualValue',
  'requestedPercent', 'approvedPercent', 'surchargePercent',
  // Milestone 2 Slice 10: the list price an approval was asked for (FR-DSC-11, FR-RBAC-17)
  'listPriceAtRequest',
  // Milestone 2 Slice 10: a manual price on "Price on request" and its request (FR-PRC-09)
  'manualMonthlyPrice', 'requestedMonthlyPrice', 'approvedMonthlyPrice',
  // Milestone 2 Slice 3: pricing configuration
  'perEmployeeFee', 'riskSurchargePercent', 'frequencyValue', 'discountCapPercent',
  // Milestone 2 Slice 6: a pipeline column's total (each card's value is netMonthlyPrice)
  'totalNetMonthlyPrice',
  // Milestone 2 Slice 8: the deal's copy of its offer value (sent as netMonthlyPrice and annualValue)
  'offerNetMonthlyPrice', 'offerAnnualValue',
  // Milestone 3 Slice 2: contract commercial fields (FR-RBAC-21). The keys that
  // double as ordinary words in other responses (`document`, `dealId`,
  // `renewalDate`) join this list in the slice that gives the contract its
  // response shape (Slices 4 to 6), so no existing response loses them early.
  'servicesSnapshot', 'termsText', 'packageId', 'packageName', 'quotationId', 'documents',
  // Milestone 3 Slice 11: the agreed monthly price on the Renewals screen (FR-REN-05).
  'monthlyPrice',
  // Milestone 3 Slice 12: the value of won deals on the Performance screen (FR-PRF-10, FR-RBAC-21).
  'totalValue',
];

/**
 * The payment field names `payments.view` guards (FR-RBAC-21). Every slice that
 * adds a payment field to a response adds its name here. `amount` is money, so
 * it is guarded by `commercial.view` as well.
 */
export const PAYMENT_FIELDS: readonly string[] = [
  'paidAt', 'paidAmount', 'payments', 'paymentSummary', 'outstanding', 'overdueCount',
  // Milestone 3 Slice 2: instalment invoice facts. Slice 8 adds the receipt shape and the flag.
  'invoiceNumber', 'invoiceDate',
  'method', 'receivedOn', 'amountReceived', 'dueNotInvoiced', 'overdueAmount', 'nextDueDate',
];

/**
 * The response fields each permission guards (FR-RBAC-06: "fields a role may
 * not see shall be removed from API responses, not only hidden in the UI").
 * Matched by key name, at any depth, so a nested line item loses its price
 * as surely as the document loses its total.
 */
const GUARDED_FIELDS: ReadonlyArray<{ permission: string; keys: ReadonlySet<string> }> = [
  {
    permission: 'commercial.view',
    keys: new Set(COMMERCIAL_FIELDS),
  },
  {
    permission: 'payments.view',
    keys: new Set(PAYMENT_FIELDS),
  },
];

/**
 * A JSON copy of `value` without the fields `access` may not see. Serialises
 * through `toJSON` first, exactly as `res.json` would, so what is redacted is
 * what would have been sent.
 */
export function redactFields<T>(value: T, access: AccessContext): unknown {
  const hidden = new Set<string>();
  for (const { permission, keys } of GUARDED_FIELDS) {
    if (!access.can(permission)) keys.forEach((key) => hidden.add(key));
  }
  const json = JSON.parse(JSON.stringify(value));
  return hidden.size === 0 ? json : strip(json, hidden);
}

function strip(value: unknown, hidden: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => strip(item, hidden));
  if (value && typeof value === 'object') {
    const kept: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!hidden.has(key)) kept[key] = strip(child, hidden);
    }
    return kept;
  }
  return value;
}
