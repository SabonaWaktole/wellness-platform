/** What a reference is made from: the number and version, or the id before numbering. */
export interface QuotationReferenceSource {
  id: string;
  number?: string | null;
  version?: number | null;
}

/**
 * The human-facing reference for a quotation or offer (FR-OFR-08, 11):
 * `OF-2026-0001`, and `OF-2026-0001 v2` from the second version on.
 *
 * The API returns it as `reference`, so notifications, the company history,
 * the PDF and every screen show the same text, and the frontend never builds
 * one itself (TD-021). A row without a number (one the reference migration
 * has not reached) falls back to the first block of its id, as before.
 */
export function quotationReference(source: QuotationReferenceSource): string {
  if (!source.number) return source.id.split('-')[0].toUpperCase();
  return source.version && source.version > 1 ? `${source.number} v${source.version}` : source.number;
}

/** OF-2026-0001: the prefix, the year and at least four digits (FR-OFR-08). */
export function formatOfferNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
