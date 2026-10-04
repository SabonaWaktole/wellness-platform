import { dayBoundsInZone, dayKeyInZone, instantInZone } from './tenantDay';

/**
 * The sales calendar's day arithmetic (M2 Slice 12).
 *
 * A calendar day has no time zone: "the 5th" is the 5th wherever you read it.
 * So the views work on day keys (`YYYY-MM-DD`) and plain calendar arithmetic
 * on them, and an instant enters only where the server needs one: the range of
 * a request, or the slot an item is dropped on. Both go through the
 * workspace's zone (FR-CAL-08), never the browser's.
 */
export type CalendarView = 'day' | 'week' | 'month' | 'agenda';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['day', 'week', 'month', 'agenda'];

/** How many days the agenda list shows from its first day. */
export const AGENDA_DAYS = 7;
/** Dragging an item snaps to this many minutes (FR-CAL-07). */
export const SNAP_MINUTES = 15;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDayKey = (value: string | null | undefined): value is string => {
  const match = value ? DAY_KEY.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const parts = (key: string): [number, number, number] => {
  const [year, month, day] = key.split('-').map(Number);
  return [year, month, day];
};

const keyOf = (utc: Date): string => utc.toISOString().slice(0, 10);

export function addDays(key: string, days: number): string {
  const [year, month, day] = parts(key);
  return keyOf(new Date(Date.UTC(year, month - 1, day + days)));
}

/** The same day of another month, or that month's last day when it is shorter. */
export function addMonths(key: string, months: number): string {
  const [year, month, day] = parts(key);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return keyOf(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))));
}

/** 0 = Monday … 6 = Sunday: weeks start on Monday, as in the workspace. */
export function weekdayIndex(key: string): number {
  const [year, month, day] = parts(key);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export const startOfWeek = (key: string): string => addDays(key, -weekdayIndex(key));
export const startOfMonth = (key: string): string => `${key.slice(0, 8)}01`;
export const isSameMonth = (a: string, b: string): boolean => a.slice(0, 7) === b.slice(0, 7);

/** A whole number of days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / (24 * 60 * 60 * 1000));
}

/** The workspace's today. */
export const todayKey = (timeZone: string, now: Date = new Date()): string => dayKeyInZone(now, timeZone);

/** The first instant of a day in the workspace's zone. */
export function startOfDayInZone(key: string, timeZone: string): Date {
  // A probe near the middle of the day, whose own day in the zone is within one of `key`.
  const probe = instantInZone(key, 12, 0, timeZone);
  return dayBoundsInZone(timeZone, daysBetween(dayKeyInZone(probe, timeZone), key), probe).start;
}

export interface VisibleRange {
  /** The days laid out, in order: one for a day, seven for a week, whole weeks for a month. */
  days: string[];
  from: Date;
  to: Date;
}

/** What a view shows around `anchor`, and the range to ask the server for (the visible range follows the view). */
export function visibleRange(view: CalendarView, anchor: string, timeZone: string): VisibleRange {
  let first: string;
  let count: number;
  switch (view) {
    case 'day':
      first = anchor;
      count = 1;
      break;
    case 'week':
      first = startOfWeek(anchor);
      count = 7;
      break;
    case 'agenda':
      first = anchor;
      count = AGENDA_DAYS;
      break;
    case 'month': {
      first = startOfWeek(startOfMonth(anchor));
      const lastOfMonth = addDays(addMonths(startOfMonth(anchor), 1), -1);
      count = daysBetween(first, startOfWeek(lastOfMonth)) + 7;
      break;
    }
  }
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  return { days, from: startOfDayInZone(first, timeZone), to: startOfDayInZone(addDays(first, count), timeZone) };
}

/** What "previous" and "next" move by, for each view. */
export function step(view: CalendarView, anchor: string, direction: -1 | 1): string {
  switch (view) {
    case 'day':
      return addDays(anchor, direction);
    case 'week':
      return addDays(anchor, 7 * direction);
    case 'agenda':
      return addDays(anchor, AGENDA_DAYS * direction);
    case 'month':
      return startOfMonth(addMonths(anchor, direction));
  }
}

/** True when `today` is one of the days laid out: the Overdue section shows on today's date (FR-CAL-04). */
export const showsToday = (days: string[], today: string): boolean => days.includes(today);

/** Minutes after midnight, in the zone, of an instant. */
export function minutesIntoDay(instant: Date | string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(
    typeof instant === 'string' ? new Date(instant) : instant
  );
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return (field('hour') % 24) * 60 + field('minute');
}

export const snapMinutes = (minutes: number, snap: number = SNAP_MINUTES): number => Math.round(minutes / snap) * snap;

/** The instant `minutes` after midnight on `key` in the zone (a wall time, so a day that changes its clocks is right). */
export function instantAtMinutes(key: string, minutes: number, timeZone: string): Date {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - SNAP_MINUTES));
  return instantInZone(key, Math.floor(clamped / 60), clamped % 60, timeZone);
}

/** The item's length, in minutes, or null when it has no end. */
export function lengthMinutes(item: { scheduledAt: string; endAt: string | null }): number | null {
  return item.endAt ? Math.round((new Date(item.endAt).getTime() - new Date(item.scheduledAt).getTime()) / 60000) : null;
}
