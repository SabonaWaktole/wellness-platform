/**
 * Calendar-day arithmetic for contract terms and instalments.
 *
 * A contract date is a workspace DAY, stored as midnight and compared as a day
 * (M3 D4), never as an instant. These helpers therefore read and write the UTC
 * calendar fields only: the caller hands in dates already normalised to the
 * workspace day (`tenantDay`), and nothing here knows about time zones. That is
 * what keeps "1 March + 12 months" the same answer in every zone and on every
 * DST day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * Adds whole months, clamping the day rather than rolling over: 31 January + 1
 * month is 28 (or 29) February, not 3 March. Always computed from the original
 * date, never cumulatively, so a 31st-of-month schedule does not drift.
 */
export const addMonths = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDayOfTarget),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
};

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

export const isBeforeDay = (a: Date, b: Date): boolean => startOfDay(a) < startOfDay(b);
