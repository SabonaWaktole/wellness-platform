import { sponsorEndDate } from '../domain/sponsorEndDate';
import { dayDate, dayText } from './memberPaymentQuote';
import type { IMemberPaymentStore } from './ports/IMemberPaymentStore';

export interface SponsorState {
  /** The company holds an Active contract that covers the day (D8). */
  valid: boolean;
  /** The end of the contract chain valid that day: the expiry a sponsored term shows (FR-EMP-09). Null when not valid. */
  endsOn: string | null;
}

/**
 * Today's sponsor validity of employer companies (M4 Slice 10, D8): the M3
 * contract rule and `sponsorEndDate`, read for any number of companies in ONE
 * query, so a page of members never costs a query per member.
 */
export class SponsorValidity {
  constructor(private readonly paymentStore: Pick<IMemberPaymentStore, 'employerContractSpans'>) {}

  async forCompanies(tenantId: string, clientIds: readonly string[], day: string): Promise<Map<string, SponsorState>> {
    const spans = await this.paymentStore.employerContractSpans(tenantId, [...clientIds]);
    const today = dayDate(day);
    const result = new Map<string, SponsorState>();
    for (const id of new Set(clientIds)) {
      const end = sponsorEndDate((spans[id] ?? []).map((s) => ({ startsOn: dayDate(s.startsOn), endsOn: dayDate(s.endsOn) })), today);
      result.set(id, { valid: end !== null, endsOn: end ? dayText(end) : null });
    }
    return result;
  }
}
