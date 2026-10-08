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
  // Milestone 3 Slice 13: a salesperson's sales value on the Sales Manager dashboard (FR-DSH-08).
  'salesValue',
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
 * The Wellness+ payment fields `members.payments.view` guards on a member
 * response (FR-RBAC-27). Every slice that adds a payment field to a member
 * response adds its name here, with a test next to it.
 */
export const MEMBER_PAYMENT_FIELDS: readonly string[] = [
  'amount', 'listFee', 'discountPercent', 'receiptNumber', 'method', 'receivedOn', 'payments', 'revenue', 'voidReason',
];

/**
 * The member contact fields `members.view` guards (FR-RBAC-27): what a user
 * holding only `members.verify` must not receive.
 */
export const MEMBER_CONTACT_FIELDS: readonly string[] = ['phone', 'email', 'note', 'verificationEvents'];

/**
 * The permission keys of the Wellness+ group. A user holding none of them
 * receives no Wellness+ field at all (FR-RBAC-27).
 */
export const WELLNESS_PLUS_PERMISSION_KEYS: readonly string[] = [
  'members.view', 'members.verify', 'members.manage', 'members.payments.view', 'members.payments.record',
  'members.import', 'members.vip.approve', 'members.reports.view', 'wellnessplus.settings.manage',
];

/**
 * The Wellness+ field names no other module uses, so they are guarded in every
 * response by `redactFields`. The names shared with companies, contracts and
 * deals (`amount`, `phone`, `email`, `note`, `method`, `payments`, ...) are
 * guarded only on member responses, by `redactMemberFields`, so no other
 * screen loses them.
 */
const WELLNESS_PLUS_UNIQUE_PAYMENT_FIELDS = ['listFee', 'receiptNumber', 'voidReason'];
const WELLNESS_PLUS_UNIQUE_CONTACT_FIELDS = ['verificationEvents'];

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
  { permission: 'members.payments.view', keys: new Set(WELLNESS_PLUS_UNIQUE_PAYMENT_FIELDS) },
  { permission: 'members.view', keys: new Set(WELLNESS_PLUS_UNIQUE_CONTACT_FIELDS) },
];

/** The same guards for a member response, where the shared names are safe to remove. */
const MEMBER_GUARDED_FIELDS: ReadonlyArray<{ permission: string; keys: ReadonlySet<string> }> = [
  { permission: 'members.payments.view', keys: new Set(MEMBER_PAYMENT_FIELDS) },
  { permission: 'members.view', keys: new Set(MEMBER_CONTACT_FIELDS) },
];

function hiddenFor(guards: typeof GUARDED_FIELDS, access: AccessContext): Set<string> {
  const hidden = new Set<string>();
  for (const { permission, keys } of guards) {
    if (!access.can(permission)) keys.forEach((key) => hidden.add(key));
  }
  return hidden;
}

/**
 * A JSON copy of `value` without the fields `access` may not see. Serialises
 * through `toJSON` first, exactly as `res.json` would, so what is redacted is
 * what would have been sent.
 */
export function redactFields<T>(value: T, access: AccessContext): unknown {
  return apply(value, hiddenFor(GUARDED_FIELDS, access));
}

/**
 * `redactFields` for a response about a member (FR-RBAC-27): payment fields go
 * without `members.payments.view`, phone, email, internal note and verification
 * log without `members.view`, and every Wellness+ field when the user holds no
 * Wellness+ permission at all. Member routes call this instead of
 * `redactFields`, because the contract and instalment guards of
 * `commercial.view` and `payments.view` do not apply to member money.
 */
export function redactMemberFields<T>(value: T, access: AccessContext): unknown {
  // Member money is governed by the Wellness+ keys alone, not by commercial.view or payments.view.
  const hidden = hiddenFor(MEMBER_GUARDED_FIELDS, access);
  if (!WELLNESS_PLUS_PERMISSION_KEYS.some((key) => access.can(key))) {
    [...MEMBER_PAYMENT_FIELDS, ...MEMBER_CONTACT_FIELDS].forEach((key) => hidden.add(key));
  }
  return apply(value, hidden);
}

function apply(value: unknown, hidden: ReadonlySet<string>): unknown {
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
