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
    keys: new Set(['paidAt', 'paidAmount', 'payments', 'paymentSummary', 'outstanding', 'overdueCount']),
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
