import { Change, moneyChange, PerformanceFigures, periodChange } from '../../domain/KpiDefinitions';

/** The figures of a row as sent. The value is a two-decimal string, and left out without `commercial.view` (FR-PRF-10). */
export function presentFigures(figures: PerformanceFigures, canSeeValue: boolean) {
  const { totalValue, ...rest } = figures;
  return canSeeValue ? { ...rest, totalValue: totalValue.toString() } : rest;
}

const NUMERIC_FIGURES = [
  'calls',
  'emails',
  'visits',
  'meetings',
  'companiesContacted',
  'offersCreated',
  'offersSent',
  'dealsWon',
  'dealsLost',
  'conversionRate',
  'followUpsCompleted',
  'onTimeShare',
  'averageTimeToClose',
] as const;

/**
 * How each figure moved against the previous period (FR-PRF-06). Overdue follow-ups are as of
 * now, not by period, so they have no previous figure to compare with.
 */
export function presentChange(current: PerformanceFigures, previous: PerformanceFigures, canSeeValue: boolean) {
  const change: Record<string, Change | { delta: string; direction: Change['direction'] } | null> = {};
  for (const key of NUMERIC_FIGURES) change[key] = periodChange(current[key], previous[key]);
  if (canSeeValue) change.totalValue = moneyChange(current.totalValue, previous.totalValue);
  return change;
}
