import { dayKeyInZone, instantInZone } from '../../shared/domain/time/tenantDay';

/** `TODAY` is for the dashboards (FR-DSH-03); the Performance screen does not offer it. */
export const PERIOD_PRESETS = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
/** The presets of the Performance screen (FR-PRF-02). */
export const PERFORMANCE_PRESETS = ['THIS_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as const;

/** Whole workspace days, `YYYY-MM-DD`, both ends included. */
export interface DayRange {
  from: string;
  to: string;
}

/** A range as the instants a query filters on: `[start, end)` (FR-PRF-05). */
export interface InstantRange {
  start: Date;
  end: Date;
}

export class InvalidPeriodError extends Error {}

const DAY_MS = 86_400_000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

const utc = (key: string) => new Date(`${key}T00:00:00.000Z`);
const keyOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (key: string, days: number) => keyOf(new Date(utc(key).getTime() + days * DAY_MS));
const firstOfMonth = (year: number, month0: number) => keyOf(new Date(Date.UTC(year, month0, 1)));
const lastOfMonth = (year: number, month0: number) => keyOf(new Date(Date.UTC(year, month0 + 1, 0)));

function assertDay(key: string): void {
  if (!KEY.test(key) || keyOf(utc(key)) !== key) throw new InvalidPeriodError(`"${key}" is not a date.`);
}

/**
 * The days a preset covers on `today` (the workspace's day), FR-PRF-02. The week
 * starts on Monday. A custom range is checked and returned as given.
 */
export function resolvePeriod(preset: PeriodPreset, today: string, custom?: DayRange): DayRange {
  assertDay(today);
  const date = utc(today);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today };
    case 'THIS_WEEK': {
      const sinceMonday = (date.getUTCDay() + 6) % 7;
      const monday = addDays(today, -sinceMonday);
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'THIS_MONTH':
      return { from: firstOfMonth(year, month), to: lastOfMonth(year, month) };
    case 'LAST_MONTH':
      return { from: firstOfMonth(year, month - 1), to: lastOfMonth(year, month - 1) };
    case 'THIS_QUARTER': {
      const first = month - (month % 3);
      return { from: firstOfMonth(year, first), to: lastOfMonth(year, first + 2) };
    }
    case 'THIS_YEAR':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'CUSTOM': {
      if (!custom) throw new InvalidPeriodError('Choose the first and last day.');
      assertDay(custom.from);
      assertDay(custom.to);
      if (custom.from > custom.to) throw new InvalidPeriodError('The first day is after the last day.');
      return { ...custom };
    }
  }
}

/**
 * The period to compare with (FR-PRF-06): the previous calendar week, month,
 * quarter or year for a preset, and for a custom range the same number of days
 * straight before it.
 */
export function previousPeriod(preset: PeriodPreset, range: DayRange): DayRange {
  const from = utc(range.from);
  switch (preset) {
    case 'TODAY':
      return { from: addDays(range.from, -1), to: addDays(range.from, -1) };
    case 'THIS_WEEK':
      return { from: addDays(range.from, -7), to: addDays(range.to, -7) };
    case 'THIS_MONTH':
    case 'LAST_MONTH':
      return { from: firstOfMonth(from.getUTCFullYear(), from.getUTCMonth() - 1), to: lastOfMonth(from.getUTCFullYear(), from.getUTCMonth() - 1) };
    case 'THIS_QUARTER':
      return {
        from: firstOfMonth(from.getUTCFullYear(), from.getUTCMonth() - 3),
        to: lastOfMonth(from.getUTCFullYear(), from.getUTCMonth() - 1),
      };
    case 'THIS_YEAR':
      return { from: `${from.getUTCFullYear() - 1}-01-01`, to: `${from.getUTCFullYear() - 1}-12-31` };
    case 'CUSTOM': {
      const length = Math.round((utc(range.to).getTime() - from.getTime()) / DAY_MS) + 1;
      return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
    }
  }
}

/** The instants bounding the days of `range` in the workspace's time zone: midnight to midnight, end excluded. */
export function instantsOf(range: DayRange, timeZone: string): InstantRange {
  return { start: instantInZone(range.from, 0, 0, timeZone), end: instantInZone(addDays(range.to, 1), 0, 0, timeZone) };
}

/** Today in the workspace, as a day key. */
export function workspaceToday(now: Date, timeZone: string): string {
  return dayKeyInZone(now, timeZone);
}

/** The weeks (Monday to Sunday) or calendar months that cover `range`, for the per-bucket series (FR-PRF-08). */
export function bucketsOf(range: DayRange, grain: 'WEEK' | 'MONTH'): DayRange[] {
  const buckets: DayRange[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const date = utc(cursor);
    const end =
      grain === 'WEEK'
        ? addDays(cursor, 6 - ((date.getUTCDay() + 6) % 7))
        : lastOfMonth(date.getUTCFullYear(), date.getUTCMonth());
    buckets.push({ from: cursor, to: end < range.to ? end : range.to });
    cursor = addDays(end, 1);
  }
  return buckets;
}
