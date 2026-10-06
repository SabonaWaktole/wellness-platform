import { Money } from '../../pricing/domain/Money';

/**
 * The salesperson indicators of SRS §6.2 as pure functions (M3 plan D10, rule
 * 4). The Performance screen uses them now and the dashboards reuse them, so
 * a figure is defined in one place and tested on a fixed set of data
 * (NFR-ACC-04). Controllers, queries and the frontend never repeat a formula.
 */

/** What one salesperson did in a period, counted by the data layer. Nothing here is a rate. */
export interface RawIndicators {
  calls: number;
  emails: number;
  visits: number;
  /** Includes online meetings. */
  meetings: number;
  /** Distinct companies with a call, email, visit or meeting. */
  companiesContacted: number;
  /** First versions only. */
  offersCreated: number;
  offersSent: number;
  dealsWon: number;
  dealsLost: number;
  /** Sum of the agreed annual value of the deals won. */
  totalValue: Money;
  followUpsCompleted: number;
  /** Of those completed, the ones completed on or before the due date. */
  followUpsOnTime: number;
  /** Open and past their due date now, whatever the period. */
  followUpsOverdue: number;
  /** Days from creating to winning, for each deal won in the period. */
  closeDays: number[];
}

export const EMPTY_INDICATORS = (): RawIndicators => ({
  calls: 0,
  emails: 0,
  visits: 0,
  meetings: 0,
  companiesContacted: 0,
  offersCreated: 0,
  offersSent: 0,
  dealsWon: 0,
  dealsLost: 0,
  totalValue: Money.zero(),
  followUpsCompleted: 0,
  followUpsOnTime: 0,
  followUpsOverdue: 0,
  closeDays: [],
});

/** A figure as a percentage with one decimal, or null when there is nothing to divide. */
function oneDecimal(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator * 1000) / denominator) / 10;
}

/** Won ÷ (won + lost), one decimal. `null` ("—") when no deal closed, never 0% (FR-PRF-04, §5.3). */
export function conversionRate(won: number, lost: number): number | null {
  return oneDecimal(won, won + lost);
}

/** The mean of the days to close, one decimal. `null` when none was won. */
export function averageTimeToClose(days: readonly number[]): number | null {
  if (days.length === 0) return null;
  const sum = days.reduce((total, value) => total + value, 0);
  return Math.round((sum * 10) / days.length) / 10;
}

/** The share of completed follow-ups that were completed on time, one decimal. `null` when none completed. */
export function onTimeShare(onTime: number, completed: number): number | null {
  return oneDecimal(onTime, completed);
}

/** The figures a row shows, derived from what it counted. */
export interface PerformanceFigures extends Omit<RawIndicators, 'closeDays'> {
  conversionRate: number | null;
  averageTimeToClose: number | null;
  onTimeShare: number | null;
}

export function figuresOf(raw: RawIndicators): PerformanceFigures {
  const { closeDays, ...counts } = raw;
  return {
    ...counts,
    conversionRate: conversionRate(raw.dealsWon, raw.dealsLost),
    averageTimeToClose: averageTimeToClose(closeDays),
    onTimeShare: onTimeShare(raw.followUpsOnTime, raw.followUpsCompleted),
  };
}

/**
 * The total row (FR-PRF-04): the underlying counts and sums added up, and the
 * rates computed again from them, never an average of the rows' rates. Companies
 * contacted is the one count that cannot be added (two people can contact the
 * same company), so the data layer counts it across the selected salespeople and
 * passes it in.
 */
export function totalRow(rows: readonly RawIndicators[], companiesContacted: number): RawIndicators {
  const total = EMPTY_INDICATORS();
  for (const row of rows) {
    total.calls += row.calls;
    total.emails += row.emails;
    total.visits += row.visits;
    total.meetings += row.meetings;
    total.offersCreated += row.offersCreated;
    total.offersSent += row.offersSent;
    total.dealsWon += row.dealsWon;
    total.dealsLost += row.dealsLost;
    total.totalValue = total.totalValue.add(row.totalValue);
    total.followUpsCompleted += row.followUpsCompleted;
    total.followUpsOnTime += row.followUpsOnTime;
    total.followUpsOverdue += row.followUpsOverdue;
    total.closeDays.push(...row.closeDays);
  }
  total.companiesContacted = companiesContacted;
  return total;
}

export interface Change {
  /** Current minus previous, in the figure's own unit (a count, or percentage points for a rate). */
  delta: number;
  direction: 'UP' | 'DOWN' | 'SAME';
}

/** How a figure moved against the previous period (FR-PRF-06). `null` when either side has no value. */
export function periodChange(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  return { delta, direction: delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'SAME' };
}

/** The change of a money figure. The delta is a string with two decimals. */
export function moneyChange(current: Money, previous: Money): { delta: string; direction: Change['direction'] } {
  const delta = current.subtract(previous);
  return { delta: delta.toString(), direction: delta.isPositive() ? 'UP' : delta.isNegative() ? 'DOWN' : 'SAME' };
}
