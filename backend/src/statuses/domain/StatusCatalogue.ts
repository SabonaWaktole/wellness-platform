/**
 * The fixed status sets the Administrator may relabel, reorder and recolour
 * (Slice 10: FR-SET-07, 08). The set of keys is fixed in code — there is no
 * create or delete — because contract, payment and deal logic depends on the
 * keys themselves; only their label, order and colour are configurable. The
 * DEAL domain holds the pipeline stages (M2 Slice 6, FR-DEAL-06).
 *
 * WAIVED is deliberately absent: it is a legacy payment status (decision D6)
 * with no SRS equivalent, kept only so existing rows keep displaying, and
 * never offered as a configurable row.
 */
export enum StatusDomain {
  Contract = 'CONTRACT',
  Payment = 'PAYMENT',
  Deal = 'DEAL',
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

/** Mirrors `backend/src/deals/domain/DealStage.ts`'s `DealStage`, in pipeline order. */
const DEAL_STAGES: StatusCatalogueEntry[] = [
  { key: 'NEW_LEAD', labelSq: 'Kontakt i ri', labelEn: 'New lead', colour: '#64748B', order: 1 },
  { key: 'CONTACTED', labelSq: 'Kontaktuar', labelEn: 'Contacted', colour: '#048E9C', order: 2 },
  { key: 'INTERESTED', labelSq: 'I interesuar', labelEn: 'Interested', colour: '#0EA5E9', order: 3 },
  { key: 'OFFER_PREPARED', labelSq: 'Ofertë e përgatitur', labelEn: 'Offer prepared', colour: '#6366F1', order: 4 },
  { key: 'OFFER_SENT', labelSq: 'Ofertë e dërguar', labelEn: 'Offer sent', colour: '#8B5CF6', order: 5 },
  { key: 'FOLLOW_UP', labelSq: 'Në ndjekje', labelEn: 'Follow-up', colour: '#D97706', order: 6 },
  { key: 'NEGOTIATION', labelSq: 'Negocim', labelEn: 'Negotiation', colour: '#EA580C', order: 7 },
  { key: 'WON', labelSq: 'Fituar', labelEn: 'Won', colour: '#3DAA6C', order: 8 },
  { key: 'LOST', labelSq: 'Humbur', labelEn: 'Lost', colour: '#DC2626', order: 9 },
];

export const STATUS_CATALOGUE: Record<StatusDomain, StatusCatalogueEntry[]> = {
  [StatusDomain.Contract]: CONTRACT_STATUSES,
  [StatusDomain.Payment]: PAYMENT_STATUSES,
  [StatusDomain.Deal]: DEAL_STAGES,
};

export function catalogueEntry(domain: StatusDomain, key: string): StatusCatalogueEntry | undefined {
  return STATUS_CATALOGUE[domain].find((entry) => entry.key === key);
}

export function catalogueKeys(domain: StatusDomain): string[] {
  return STATUS_CATALOGUE[domain].map((entry) => entry.key);
}
