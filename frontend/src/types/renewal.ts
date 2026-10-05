/** The Renewals screen's tabs (M3 Slice 11, FR-REN-05, FR-REN-09). */
export const RENEWAL_WINDOWS = ['30', '60', '90', 'RECENTLY_EXPIRED'] as const;
export type RenewalWindow = (typeof RENEWAL_WINDOWS)[number];

/** Derived by the server, never stored (D9). */
export type RenewalState = 'NOT_STARTED' | 'IN_NEGOTIATION' | 'RENEWED' | 'NOT_RENEWING';

export type RenewalAction = 'START_RENEWAL' | 'MARK_NOT_RENEWING' | 'UNDO_NOT_RENEWING';

/**
 * One row of the Renewals screen as the server sends it. What the viewer may not
 * see is absent, not empty: Reception gets the validity facts only; the rest
 * need `contracts.manage` or `commercial.view` (see the backend's presentRenewalRow).
 * Dates are calendar days, `YYYY-MM-DD`; money is a string that is only formatted.
 */
export interface RenewalRow {
  contractId: string;
  number: string;
  status: string;
  company: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  /** Negative once the term has ended. */
  daysRemaining: number;
  salesperson?: { id: string; name: string } | null;
  state?: RenewalState;
  renewedInto?: { id: string; number: string | null } | null;
  actions?: RenewalAction[];
  planName?: string;
  monthlyPrice?: string;
  openDealId?: string | null;
  notRenewing?: { reasonId: string; reasonSq: string; reasonEn: string | null; note: string | null } | null;
}

export interface RenewalsPage {
  data: RenewalRow[];
  count: number;
  page: number;
  limit: number;
  window: RenewalWindow;
}

export interface RenewalFilters {
  window: RenewalWindow;
  query?: string;
  assignedUserId?: string;
}
