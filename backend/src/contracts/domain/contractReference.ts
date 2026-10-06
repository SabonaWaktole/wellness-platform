/**
 * The human-facing reference for a contract.
 *
 * Mirrors `invoiceReference`/`quotationReference` — the frontend needs a short
 * code to display, and a third convention for the same job would be worse than
 * the shared TD-021 caveat: this is not a guaranteed-unique identifier, just
 * the first eight hex characters of the id.
 */
export function contractReference(contractId: string): string {
  return contractId.split('-')[0].toUpperCase();
}

/** CTR-2026-0001: the prefix, the year and at least four digits (FR-CON-05), as offer numbers are (M2 FR-OFR-08). */
export function formatContractNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}
