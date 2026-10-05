import type { FigureKey, PerformanceIndicator } from '../../types/performance';

export type FigureFormat = 'count' | 'money' | 'percent' | 'days';

export interface PerformanceColumn {
  indicator: PerformanceIndicator;
  key: FigureKey;
  format: FigureFormat;
}

/**
 * The fourteen indicators of SRS §6.2 in the order of the table. What each one means is the server's
 * to say; this only says which figure a column shows and how it is written.
 */
export const PERFORMANCE_COLUMNS: readonly PerformanceColumn[] = [
  { indicator: 'CALLS', key: 'calls', format: 'count' },
  { indicator: 'EMAILS', key: 'emails', format: 'count' },
  { indicator: 'VISITS', key: 'visits', format: 'count' },
  { indicator: 'MEETINGS', key: 'meetings', format: 'count' },
  { indicator: 'COMPANIES_CONTACTED', key: 'companiesContacted', format: 'count' },
  { indicator: 'OFFERS_CREATED', key: 'offersCreated', format: 'count' },
  { indicator: 'OFFERS_SENT', key: 'offersSent', format: 'count' },
  { indicator: 'DEALS_WON', key: 'dealsWon', format: 'count' },
  { indicator: 'DEALS_LOST', key: 'dealsLost', format: 'count' },
  { indicator: 'TOTAL_VALUE', key: 'totalValue', format: 'money' },
  { indicator: 'CONVERSION_RATE', key: 'conversionRate', format: 'percent' },
  { indicator: 'FOLLOW_UPS_COMPLETED', key: 'followUpsCompleted', format: 'count' },
  { indicator: 'FOLLOW_UPS_OVERDUE', key: 'followUpsOverdue', format: 'count' },
  { indicator: 'AVERAGE_TIME_TO_CLOSE', key: 'averageTimeToClose', format: 'days' },
];

/** The camelCase translation key of an indicator, e.g. FOLLOW_UPS_COMPLETED → followUpsCompleted. */
export const indicatorKey = (indicator: PerformanceIndicator): string =>
  indicator.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
