import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  instantAtMinutes,
  isDayKey,
  minutesIntoDay,
  snapMinutes,
  startOfDayInZone,
  startOfMonth,
  startOfWeek,
  step,
  todayKey,
  visibleRange,
  weekdayIndex,
} from './calendarDays';

const TIRANE = 'Europe/Tirane';

describe('calendarDays (M2 Slice 12)', () => {
  describe('calendar arithmetic on day keys', () => {
    it('adds days across month and year ends', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('adds months, clamping to the last day of a shorter month', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
      expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    });

    it('weeks start on Monday', () => {
      expect(weekdayIndex('2026-10-05')).toBe(0); // a Monday
      expect(weekdayIndex('2026-10-11')).toBe(6); // a Sunday
      expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
      expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
    });

    it('knows a real day key from a made-up one', () => {
      expect(isDayKey('2026-02-29')).toBe(false);
      expect(isDayKey('2026-13-01')).toBe(false);
      expect(isDayKey('26-10-05')).toBe(false);
      expect(isDayKey(null)).toBe(false);
      expect(isDayKey('2028-02-29')).toBe(true);
    });

    it('counts the days between two keys', () => {
      expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
      expect(daysBetween('2026-10-12', '2026-10-05')).toBe(-7);
    });
  });

  describe('the visible range follows the view (the fetch window)', () => {
    it('a day is one day: [start, next start) in the workspace zone', () => {
      const range = visibleRange('day', '2026-10-05', TIRANE);
      expect(range.days).toEqual(['2026-10-05']);
      // Tirane is on summer time until the 25th: UTC+2.
      expect(range.from.toISOString()).toBe('2026-10-04T22:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-10-05T22:00:00.000Z');
    });

    it('a week is Monday to Sunday around the anchor', () => {
      const range = visibleRange('week', '2026-10-08', TIRANE);
      expect(range.days[0]).toBe('2026-10-05');
      expect(range.days).toHaveLength(7);
      expect(range.days[6]).toBe('2026-10-11');
    });

    it('a month is whole weeks, with the leading and trailing days of its neighbours', () => {
      const range = visibleRange('month', '2026-10-15', TIRANE);
      expect(range.days[0]).toBe('2026-09-28'); // 1 October 2026 is a Thursday
      expect(range.days.at(-1)).toBe('2026-11-01'); // 31 October is a Saturday
      expect(range.days.length % 7).toBe(0);
    });

    it('a month that fits in four weeks has four rows, and one that spills has six', () => {
      expect(visibleRange('month', '2027-02-10', TIRANE).days).toHaveLength(28); // 1 Feb 2027 is a Monday
      expect(visibleRange('month', '2026-08-10', TIRANE).days).toHaveLength(42); // 1 Aug 2026 is a Saturday
    });

    it('the agenda is seven days from its first', () => {
      const range = visibleRange('agenda', '2026-10-05', TIRANE);
      expect(range.days).toHaveLength(7);
      expect(range.days[0]).toBe('2026-10-05');
    });

    it('a range across the autumn clock change is a day longer than 24 hours times its days', () => {
      // Tirane falls back on Sunday 25 October 2026: that day has 25 hours.
      const range = visibleRange('week', '2026-10-21', TIRANE);
      expect(range.to.getTime() - range.from.getTime()).toBe(7 * 24 * 3600 * 1000 + 3600 * 1000);
    });

    it('is the same for a browser in any zone: it depends on the workspace zone only', () => {
      expect(visibleRange('day', '2026-10-05', 'America/New_York').from.toISOString()).toBe('2026-10-05T04:00:00.000Z');
      expect(visibleRange('day', '2026-10-05', 'Asia/Kathmandu').from.toISOString()).toBe('2026-10-04T18:15:00.000Z');
    });
  });

  describe('navigation', () => {
    it('steps by the view: a day, a week, the agenda\'s week, a month', () => {
      expect(step('day', '2026-10-05', 1)).toBe('2026-10-06');
      expect(step('week', '2026-10-05', -1)).toBe('2026-09-28');
      expect(step('agenda', '2026-10-05', 1)).toBe('2026-10-12');
      expect(step('month', '2026-10-31', 1)).toBe('2026-11-01');
      expect(step('month', '2026-01-15', -1)).toBe('2025-12-01');
    });

    it('a month\'s first day', () => {
      expect(startOfMonth('2026-10-17')).toBe('2026-10-01');
    });
  });

  describe('the workspace\'s today', () => {
    it('is the day in the workspace zone, not the host\'s', () => {
      const lateUtc = new Date('2026-07-27T21:30:00Z');
      expect(todayKey('Europe/Tirane', lateUtc)).toBe('2026-07-27');
      expect(todayKey('Africa/Addis_Ababa', lateUtc)).toBe('2026-07-28');
    });
  });

  describe('time slots (FR-CAL-07)', () => {
    it('reads the minutes into the day in the workspace zone', () => {
      expect(minutesIntoDay('2026-10-05T07:00:00.000Z', TIRANE)).toBe(9 * 60);
      expect(minutesIntoDay('2026-01-15T08:00:00.000Z', TIRANE)).toBe(9 * 60); // winter: UTC+1
      expect(minutesIntoDay('2026-10-05T21:59:00.000Z', TIRANE)).toBe(23 * 60 + 59);
    });

    it('snaps to 15 minutes', () => {
      expect(snapMinutes(7)).toBe(0);
      expect(snapMinutes(8)).toBe(15);
      expect(snapMinutes(9 * 60 + 52)).toBe(9 * 60 + 45);
      expect(snapMinutes(9 * 60 + 53)).toBe(10 * 60);
    });

    it('turns a slot into the instant, summer and winter', () => {
      expect(instantAtMinutes('2026-10-05', 14 * 60, TIRANE).toISOString()).toBe('2026-10-05T12:00:00.000Z');
      expect(instantAtMinutes('2026-01-15', 14 * 60, TIRANE).toISOString()).toBe('2026-01-15T13:00:00.000Z');
    });

    it('a slot on the spring-forward day is the right wall time after the jump', () => {
      expect(instantAtMinutes('2026-03-29', 10 * 60, TIRANE).toISOString()).toBe('2026-03-29T08:00:00.000Z');
    });

    it('never goes past the last slot of the day', () => {
      expect(minutesIntoDay(instantAtMinutes('2026-10-05', 24 * 60 + 90, TIRANE), TIRANE)).toBe(23 * 60 + 45);
      expect(minutesIntoDay(instantAtMinutes('2026-10-05', -30, TIRANE), TIRANE)).toBe(0);
    });

    it('the start of a day is local midnight', () => {
      expect(startOfDayInZone('2026-10-05', TIRANE).toISOString()).toBe('2026-10-04T22:00:00.000Z');
    });
  });
});
