/** The period presets of the Performance screen (FR-PRF-02). */
export const PERIOD_PRESETS = ['THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** The indicators a row can be clicked on (FR-PRF-07); the order is the order of the columns. */
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

/**
 * One row's figures as the server worked them out. `totalValue` is a two-decimal string, only formatted
 * here, and absent without `commercial.view` (FR-PRF-10). A rate with nothing to divide is `null`.
 */
export interface PerformanceFigures {
  calls: number;
  emails: number;
  visits: number;
  meetings: number;
  companiesContacted: number;
  offersCreated: number;
  offersSent: number;
  dealsWon: number;
  dealsLost: number;
  totalValue?: string;
  conversionRate: number | null;
  followUpsCompleted: number;
  followUpsOnTime: number;
  onTimeShare: number | null;
  followUpsOverdue: number;
  averageTimeToClose: number | null;
}

export type FigureKey = keyof PerformanceFigures;

/** How a figure moved against the previous period (FR-PRF-06). A money change carries its delta as a string. */
export interface FigureChange {
  delta: number | string;
  direction: 'UP' | 'DOWN' | 'SAME';
}

export interface Salesperson {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PerformanceRow {
  salesperson: Salesperson;
  figures: PerformanceFigures;
  change?: Partial<Record<FigureKey, FigureChange | null>>;
}

export interface PerformanceResult {
  period: { from: string; to: string; previous?: { from: string; to: string } };
  rows: PerformanceRow[];
  salespeople: Salesperson[];
  /** Null for a Sales User, who sees only their own row (FR-PRF-01). */
  total: Omit<PerformanceRow, 'salesperson'> | null;
  ownOnly: boolean;
}

export interface PerformanceFilters {
  preset: PeriodPreset;
  from?: string;
  to?: string;
  salespersonIds?: string[];
  compare?: boolean;
}

export type RecordKind = 'ACTIVITY' | 'OFFER' | 'DEAL' | 'FOLLOW_UP';

/** One activity, offer, deal or follow-up behind a figure (FR-PRF-07). */
export interface PerformanceRecord {
  kind: RecordKind;
  id: string;
  at: string;
  clientId: string;
  companyName: string;
  salesperson: { id: string; name: string };
  label: string | null;
  detail: string | null;
  dealId: string | null;
  annualValue?: string | null;
}

export interface PerformanceRecordsPage {
  period: { from: string; to: string };
  indicator: PerformanceIndicator;
  rows: PerformanceRecord[];
  count: number;
  page: number;
  limit: number;
}

export interface SeriesPoint {
  from: string;
  to: string;
  figures: Omit<PerformanceFigures, 'followUpsOverdue'>;
}

export interface PerformanceSeries {
  salesperson: Salesperson | null;
  grain: 'WEEK' | 'MONTH';
  period: { from: string; to: string };
  points: SeriesPoint[];
}
