import type { Tier } from '../../../domain/Tier';
import type { TierHistoryFigure } from '../../../domain/MembershipKpiDefinitions';
import type { PaymentKind } from '../../../domain/termDates';

/** The report filters (FR-RPT-01). The location is the employer company's predefined Area and City. */
export interface ReportFilters {
  tier?: Tier;
  segment?: 'CORPORATE' | 'INDIVIDUAL';
  employerClientId?: string;
  areaId?: string;
  cityId?: string;
}

/** One request: the period as days and as instants (`[start, end)`), and "now" for the as-of-now figures. */
export interface ReportQuery {
  tenantId: string;
  filters: ReportFilters;
  days: { from: string; to: string };
  window: { start: Date; end: Date };
  today: string;
  graceDays: number;
  expiringSoonDays: number;
  vipReviewNoticeDays: number;
}

export interface TierCount {
  tier: Tier;
  count: number;
}

export interface MonthEnd {
  /** `YYYY-MM`. */
  month: string;
  /** The instant the month closes, or now for the running month. */
  end: Date;
}

export interface PaymentGroup {
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  count: number;
  /** Two-decimal sum, never a float. */
  total: string;
}

export interface RenewalTermFigure {
  tier: Tier;
  endsOn: Date;
  renewalPaidOn: Date | null;
}

export interface EmployerRow {
  companyId: string;
  name: string | null;
  members: number;
  sponsoredSilver: number;
  upgradedToPaid: number;
  formerEmployees: number;
}

export type WorkingListKind = 'EXPIRING' | 'VIP_REVIEW' | 'FORMER_EMPLOYEES';

export interface WorkingListRow {
  memberId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  tier: Tier;
  /** The paid term end, the VIP review date or the day the member left the company. */
  date: string | null;
  employer: { id: string; name: string | null } | null;
  phone: string | null;
  email: string | null;
}

export const WORKING_LIST_LIMIT = 1000;

/**
 * Every read behind the Wellness+ reports (Slice 14, FR-RPT-01..09). One method
 * per figure group, each a single reviewed query so both databases give the
 * same numbers (D15). The tenant is always in the query.
 */
export interface IMembershipReportReader {
  /** True when each id given is a predefined Area or City of the workspace and the city is in the area (FR-RPT-01). */
  locationIsPredefined(tenantId: string, location: { areaId?: string; cityId?: string }): Promise<boolean>;
  employerExists(tenantId: string, clientId: string): Promise<boolean>;
  /** Active members by stored current tier, as of now. */
  activeByTier(query: ReportQuery): Promise<TierCount[]>;
  /** Active members with and without an employer company, as of now. */
  activeBySegment(query: ReportQuery): Promise<{ corporate: number; individual: number }>;
  /** Active members per tier at each month end, replayed from the tier and status histories (FR-RPT-02, D15). */
  activeAtMonthEnds(query: ReportQuery, months: readonly MonthEnd[]): Promise<Array<{ month: string; tier: Tier; count: number }>>;
  newMembers(query: ReportQuery): Promise<{ corporate: number; individual: number }>;
  /** Payments not voided with the date received in the period, grouped by kind and tiers. */
  paymentGroups(query: ReportQuery): Promise<PaymentGroup[]>;
  downgrades(query: ReportQuery): Promise<Array<TierHistoryFigure>>;
  renewalTerms(query: ReportQuery): Promise<RenewalTermFigure[]>;
  employers(query: ReportQuery): Promise<EmployerRow[]>;
  workingList(query: ReportQuery, kind: WorkingListKind): Promise<WorkingListRow[]>;
}
