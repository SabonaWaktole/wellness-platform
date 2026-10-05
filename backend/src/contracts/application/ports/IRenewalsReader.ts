import { RecordScope } from '../../../access/domain/RecordScope';
import { Money } from '../../../pricing/domain/Money';
import { RenewalState } from '../../domain/renewalState';

/** The Renewals screen's tabs (FR-REN-05, FR-REN-09). */
export const RENEWAL_WINDOWS = ['30', '60', '90', 'RECENTLY_EXPIRED'] as const;
export type RenewalWindow = (typeof RENEWAL_WINDOWS)[number];

/** How far back an Expired contract stays under "Recently expired" (FR-REN-09). */
export const RECENTLY_EXPIRED_DAYS = 90;

export interface RenewalFilters {
  tenantId: string;
  /** The companies the viewer may see, from `contracts.validity.view` (FR-RBAC-11). Applied in the query. */
  scope: RecordScope;
  /** The workspace day, a UTC-midnight date. */
  today: Date;
  window: RenewalWindow;
  /** The responsible salesperson: the contract's, else the company's. */
  assignedUserId?: string;
  /** Part of the company's name or the contract's number. */
  query?: string;
}

/** One contract on the Renewals screen with what its renewal state is made of. */
export interface RenewalRow {
  contractId: string;
  number: string | null;
  planName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  client: { id: string; name: string };
  salesperson: { id: string; name: string } | null;
  /** The company's salesperson: whose scope the contract falls in (FR-RBAC-11). Never sent to the client. */
  clientAssignedUserId: string | null;
  /** The agreed monthly price. */
  monthlyPrice: Money;
  state: RenewalState;
  notRenewing: { reasonId: string; reasonSq: string; reasonEn: string | null; note: string | null } | null;
  renewedInto: { id: string; number: string | null } | null;
  openDealId: string | null;
}

/**
 * The read side of the Renewals screen. The scope is part of the query, so a
 * page of 25 is 25 rows of the viewer's own scope and the total is of exactly
 * those rows (FR-REN-05).
 */
export interface IRenewalsReader {
  search(filters: RenewalFilters, page: { page: number; limit: number }): Promise<{ rows: RenewalRow[]; total: number }>;
}
