import { addDays, addMonths } from './calendarDay';

/**
 * End date of a term: start plus the contract months, minus one day (D4,
 * FR-CON-03). The month is clamped before the day is subtracted, so
 * 1 March 2027 + 12 months is 29 February 2028 and 31 January 2027 + 1 month
 * is 27 February 2027 (28 February, less a day).
 */
export function defaultEndDate(start: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error('A contract term must be a whole number of months, at least 1');
  }
  return addDays(addMonths(start, months), -1);
}

/**
 * The date by which a renewal should be agreed: the end date minus the largest
 * reminder lead time (FR-CON-07). No lead times means no earlier date to aim
 * for, so the end date itself.
 */
export function defaultRenewalDate(end: Date, leadDays: readonly number[]): Date {
  if (leadDays.length === 0) return end;
  return addDays(end, -Math.max(...leadDays));
}
