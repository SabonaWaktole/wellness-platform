/**
 * The fixed status sets the Administrator may relabel, reorder and recolour
 * (Slice 10: FR-SET-07, 08). The set of keys is fixed in code — there is no
 * create or delete — because contract and payment logic depends on the keys
 * themselves; only their label, order and colour are configurable.
 *
 * WAIVED is deliberately absent: it is a legacy payment status (decision D6)
 * with no SRS equivalent, kept only so existing rows keep displaying, and
 * never offered as a configurable row.
 */
export enum StatusDomain {
  Contract = 'CONTRACT',
  Payment = 'PAYMENT',
}

export function isStatusDomain(value: string): value is StatusDomain {
  return Object.values(StatusDomain).includes(value as StatusDomain);
}

export interface StatusCatalogueEntry {
  key: string;
  labelSq: string;
  labelEn: string;
  colour: string;
  order: number;
}

/** Mirrors `backend/src/contracts/domain/Contract.ts`'s `ContractStatus`. */
const CONTRACT_STATUSES: StatusCatalogueEntry[] = [
  { key: 'DRAFT', labelSq: 'Skicë', labelEn: 'Draft', colour: '#64748B', order: 1 },
  { key: 'PENDING_SIGNATURE', labelSq: 'Në pritje të nënshkrimit', labelEn: 'Pending signature', colour: '#D97706', order: 2 },
  { key: 'ACTIVE', labelSq: 'Aktive', labelEn: 'Active', colour: '#3DAA6C', order: 3 },
  { key: 'SUSPENDED', labelSq: 'Pezulluar', labelEn: 'Suspended', colour: '#DC2626', order: 4 },
  { key: 'EXPIRED', labelSq: 'Skaduar', labelEn: 'Expired', colour: '#64748B', order: 5 },
  { key: 'CANCELLED', labelSq: 'Anulluar', labelEn: 'Cancelled', colour: '#64748B', order: 6 },
];

/** Mirrors `backend/src/contracts/domain/ContractPayment.ts`'s `PaymentStatus`, minus the legacy WAIVED. */
const PAYMENT_STATUSES: StatusCatalogueEntry[] = [
  { key: 'NOT_INVOICED', labelSq: 'Pa faturuar', labelEn: 'Not invoiced', colour: '#64748B', order: 1 },
  { key: 'INVOICE_ISSUED', labelSq: 'Faturë lëshuar', labelEn: 'Invoice issued', colour: '#048E9C', order: 2 },
  { key: 'PAYMENT_PENDING', labelSq: 'Në pritje të pagesës', labelEn: 'Payment pending', colour: '#D97706', order: 3 },
  { key: 'PARTIALLY_PAID', labelSq: 'Pjesërisht paguar', labelEn: 'Partially paid', colour: '#D97706', order: 4 },
  { key: 'PAID', labelSq: 'Paguar', labelEn: 'Paid', colour: '#3DAA6C', order: 5 },
  { key: 'OVERDUE', labelSq: 'Vonuar', labelEn: 'Overdue', colour: '#DC2626', order: 6 },
];

export const STATUS_CATALOGUE: Record<StatusDomain, StatusCatalogueEntry[]> = {
  [StatusDomain.Contract]: CONTRACT_STATUSES,
  [StatusDomain.Payment]: PAYMENT_STATUSES,
};

export function catalogueEntry(domain: StatusDomain, key: string): StatusCatalogueEntry | undefined {
  return STATUS_CATALOGUE[domain].find((entry) => entry.key === key);
}

export function catalogueKeys(domain: StatusDomain): string[] {
  return STATUS_CATALOGUE[domain].map((entry) => entry.key);
}
