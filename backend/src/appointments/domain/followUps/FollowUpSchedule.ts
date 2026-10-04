import { dayKeyInZone, instantInZone } from '../../../shared/domain/time/tenantDay';
import { InvalidFollowUpError } from './errors';

/** The time a follow-up is due at unless the user changes it (FR-FUP-02). */
export const DEFAULT_FOLLOW_UP_TIME = '09:00';

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * When a "+N days" follow-up is due (FR-FUP-01, 03, Q12): N calendar days
 * after today in the workspace's time zone, at `time` there. A Saturday or a
 * Sunday moves to the next Monday.
 */
export function followUpDue(now: Date, intervalDays: number, timeZone: string, time: string = DEFAULT_FOLLOW_UP_TIME): Date {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new InvalidFollowUpError('intervalDays', 'The interval must be a whole number of days, at least 1.');
  }
  let day = addDays(dayKeyInZone(now, timeZone), intervalDays);
  const weekday = weekdayOf(day);
  if (weekday === 6) day = addDays(day, 2);
  if (weekday === 0) day = addDays(day, 1);
  return followUpOn(day, time, timeZone);
}

/**
 * A follow-up on a chosen day (the "Custom date" button, FR-FUP-01), at
 * `time` in the workspace's time zone. The day is kept as chosen: only the
 * "+N days" buttons move off a weekend.
 */
export function followUpOn(dayKey: string, time: string, timeZone: string): Date {
  const date = DAY_KEY.exec(dayKey);
  if (!date || !isCalendarDate(Number(date[1]), Number(date[2]), Number(date[3]))) {
    throw new InvalidFollowUpError('dueDate', 'Choose a valid date.');
  }
  const clock = TIME.exec(time);
  if (!clock) {
    throw new InvalidFollowUpError('time', 'Choose a valid time.');
  }
  return instantInZone(dayKey, Number(clock[1]), Number(clock[2]), timeZone);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. A calendar day has no zone, so UTC is exact here. */
function weekdayOf(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
