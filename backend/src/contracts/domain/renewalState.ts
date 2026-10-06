/**
 * Where a contract stands on renewal (M3 D9, FR-REN-05). Derived on read, never
 * stored, in this order: marked Not renewing, then Renewed (a later term
 * exists), then In negotiation (an open Renewal deal), else Not started.
 */
export const RENEWAL_STATES = ['NOT_RENEWING', 'RENEWED', 'IN_NEGOTIATION', 'NOT_STARTED'] as const;
export type RenewalState = (typeof RENEWAL_STATES)[number];

export function renewalStateOf(facts: { notRenewing: boolean; renewed: boolean; openDeal: boolean }): RenewalState {
  if (facts.notRenewing) return 'NOT_RENEWING';
  if (facts.renewed) return 'RENEWED';
  if (facts.openDeal) return 'IN_NEGOTIATION';
  return 'NOT_STARTED';
}
