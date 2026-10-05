import { RawIndicators } from '../../../domain/KpiDefinitions';
import { DayRange, InstantRange } from '../../../domain/PerformancePeriod';

/** The indicators of SRS §6.2 a row can be clicked on (FR-PRF-07). */
export const PERFORMANCE_INDICATORS = [
  'CALLS',
  'EMAILS',
  'VISITS',
  'MEETINGS',
  'COMPANIES_CONTACTED',
  'OFFERS_CREATED',
  'OFFERS_SENT',
  'DEALS_WON',
  'DEALS_LOST',
  'TOTAL_VALUE',
  'CONVERSION_RATE',
  'FOLLOW_UPS_COMPLETED',
  'FOLLOW_UPS_OVERDUE',
  'AVERAGE_TIME_TO_CLOSE',
] as const;
export type PerformanceIndicator = (typeof PERFORMANCE_INDICATORS)[number];

export interface Salesperson {
  id: string;
  name: string;
  isActive: boolean;
}

/** One period and the people it is read for. Salespeople are already inside the viewer's scope. */
export interface IndicatorQuery {
  tenantId: string;
  salespersonIds: readonly string[];
  /** Whole workspace days: won and lost carry a calendar date, not an instant. */
  days: DayRange;
  /** The same days as instants in the workspace time zone, for everything with a time. */
  window: InstantRange;
  timezone: string;
  /** "Now" for the overdue follow-ups, which are as of the time of viewing. */
  now: Date;
}

export interface IndicatorResult {
  perPerson: Map<string, RawIndicators>;
  /** Distinct companies contacted by any of the selected salespeople. */
  companiesContacted: number;
}

export type PerformanceRecordKind = 'ACTIVITY' | 'OFFER' | 'DEAL' | 'FOLLOW_UP';

/** One activity, offer, deal or follow-up behind a figure (FR-PRF-07). */
export interface PerformanceRecord {
  kind: PerformanceRecordKind;
  id: string;
  at: Date;
  clientId: string;
  companyName: string;
  salespersonId: string;
  /** The offer number or the deal title, when there is one. */
  label: string | null;
  /** The activity type, offer or follow-up status, or WON / LOST for a deal. */
  detail: string | null;
  dealId: string | null;
  /** The agreed annual value of a won deal, as a two-decimal string. Guarded as `annualValue`. */
  annualValue: string | null;
}

export interface IPerformanceReader {
  people(tenantId: string, ids: readonly string[]): Promise<Salesperson[]>;
  indicators(query: IndicatorQuery): Promise<IndicatorResult>;
  records(
    query: IndicatorQuery & { indicator: PerformanceIndicator; limit: number; offset: number }
  ): Promise<{ rows: PerformanceRecord[]; total: number }>;
}
