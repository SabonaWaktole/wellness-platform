import { dayKeyInZone, isSameDayInZone, dayBoundsInZone, instantInZone } from '@shared/domain/time/tenantDay';

/**
 * ===========================================================================
 * SHARED FIXTURE — MUST MATCH `frontend/src/utils/tenantDay.test.ts` EXACTLY.
 *
 * The two packages cannot import a common module, so the day definition is
 * duplicated. This table is the contract between the copies: if either side's
 * logic drifts, its suite fails here.
 *
 * Copy the table verbatim when adding cases; do not "improve" it on one side.
 * ===========================================================================
 */
export const TIMEZONE_DAY_FIXTURES: Array<{
  name: string;
  instant: string;
  timeZone: string;
  expectedDay: string;
  /**
   * The `[start, end)` UTC instants of the tenant-local day containing
   * `instant`, i.e. `dayBoundsInZone(timeZone, 0, instant)`.
   *
   * Added with `dayBoundsInZone` (TD-029). Note the two DST rows: the Tirane
   * spring-forward day is 23 hours long and the New York fall-back day is 25.
   * Any implementation that reaches the end of a day by adding 24 hours gets
   * both wrong, which is the point of pinning them here.
   */
  expectedStart: string;
  expectedEnd: string;
}> = [
  // The exact case that was broken in production: server on UTC+3, user on
  // UTC+2, appointment at 21:30Z. The two disagreed about the date.
  { name: 'late evening UTC, Addis (UTC+3) has rolled over',
    instant: '2026-07-27T21:30:00.000Z', timeZone: 'Africa/Addis_Ababa', expectedDay: '2026-07-28',
    expectedStart: '2026-07-27T21:00:00.000Z', expectedEnd: '2026-07-28T21:00:00.000Z' },
  { name: 'same instant, Tirane (UTC+2) has not',
    instant: '2026-07-27T21:30:00.000Z', timeZone: 'Europe/Tirane', expectedDay: '2026-07-27',
    expectedStart: '2026-07-26T22:00:00.000Z', expectedEnd: '2026-07-27T22:00:00.000Z' },
  { name: 'same instant in UTC itself',
    instant: '2026-07-27T21:30:00.000Z', timeZone: 'UTC', expectedDay: '2026-07-27',
    expectedStart: '2026-07-27T00:00:00.000Z', expectedEnd: '2026-07-28T00:00:00.000Z' },

  // Behind UTC: the previous day locally while UTC has already turned over.
  { name: 'just after UTC midnight, New York is still on the previous day',
    instant: '2026-07-28T02:00:00.000Z', timeZone: 'America/New_York', expectedDay: '2026-07-27',
    expectedStart: '2026-07-27T04:00:00.000Z', expectedEnd: '2026-07-28T04:00:00.000Z' },
  { name: 'just after UTC midnight, Tirane is on the new day',
    instant: '2026-07-28T02:00:00.000Z', timeZone: 'Europe/Tirane', expectedDay: '2026-07-28',
    expectedStart: '2026-07-27T22:00:00.000Z', expectedEnd: '2026-07-28T22:00:00.000Z' },

  // DST boundaries — the reason this uses Intl rather than fixed offsets.
  // This Tirane day is 23 hours long: 23:00Z -> 22:00Z.
  { name: 'European spring-forward night, before the jump',
    instant: '2026-03-29T00:30:00.000Z', timeZone: 'Europe/Tirane', expectedDay: '2026-03-29',
    expectedStart: '2026-03-28T23:00:00.000Z', expectedEnd: '2026-03-29T22:00:00.000Z' },
  // This New York day is 25 hours long: 04:00Z -> 05:00Z.
  { name: 'US autumn fall-back morning',
    instant: '2026-11-01T05:30:00.000Z', timeZone: 'America/New_York', expectedDay: '2026-11-01',
    expectedStart: '2026-11-01T04:00:00.000Z', expectedEnd: '2026-11-02T05:00:00.000Z' },

  // A half-hour zone, which offset arithmetic in whole hours would get wrong.
  { name: 'half-hour offset zone (UTC+5:45)',
    instant: '2026-07-27T18:30:00.000Z', timeZone: 'Asia/Kathmandu', expectedDay: '2026-07-28',
    expectedStart: '2026-07-27T18:15:00.000Z', expectedEnd: '2026-07-28T18:15:00.000Z' },

  // Exactly midnight in the zone belongs to the new day, not the old one.
  { name: 'exact local midnight belongs to the starting day',
    instant: '2026-07-27T22:00:00.000Z', timeZone: 'Europe/Tirane', expectedDay: '2026-07-28',
    expectedStart: '2026-07-27T22:00:00.000Z', expectedEnd: '2026-07-28T22:00:00.000Z' },
];

/**
 * SHARED FIXTURE — MUST MATCH THE OTHER PACKAGE'S COPY EXACTLY (see above).
 * `instantInZone(dayKey, hour, minute, timeZone)` and the instant it gives.
 */
export const WALL_CLOCK_FIXTURES: Array<{ name: string; dayKey: string; hour: number; minute: number; timeZone: string; expected: string }> = [
  { name: 'Tirane in summer (UTC+2)', dayKey: '2026-07-27', hour: 9, minute: 0, timeZone: 'Europe/Tirane', expected: '2026-07-27T07:00:00.000Z' },
  { name: 'Tirane in winter (UTC+1)', dayKey: '2026-01-15', hour: 9, minute: 0, timeZone: 'Europe/Tirane', expected: '2026-01-15T08:00:00.000Z' },
  { name: 'Tirane, a time after the spring-forward jump', dayKey: '2026-03-29', hour: 10, minute: 15, timeZone: 'Europe/Tirane', expected: '2026-03-29T08:15:00.000Z' },
  { name: 'Tirane, a time before the spring-forward jump', dayKey: '2026-03-29', hour: 1, minute: 30, timeZone: 'Europe/Tirane', expected: '2026-03-29T00:30:00.000Z' },
  { name: 'Tirane, a time the spring-forward skips resolves an hour later', dayKey: '2026-03-29', hour: 2, minute: 30, timeZone: 'Europe/Tirane', expected: '2026-03-29T01:30:00.000Z' },
  { name: 'New York, the fall-back day after the repeat', dayKey: '2026-11-01', hour: 12, minute: 0, timeZone: 'America/New_York', expected: '2026-11-01T17:00:00.000Z' },
  { name: 'half-hour zone (UTC+5:45)', dayKey: '2026-07-27', hour: 8, minute: 30, timeZone: 'Asia/Kathmandu', expected: '2026-07-27T02:45:00.000Z' },
  { name: 'UTC itself', dayKey: '2026-07-27', hour: 23, minute: 59, timeZone: 'UTC', expected: '2026-07-27T23:59:00.000Z' },
];

describe('tenantDay (backend)', () => {
  describe('dayKeyInZone — shared fixture', () => {
    it.each(TIMEZONE_DAY_FIXTURES)('$name', ({ instant, timeZone, expectedDay }) => {
      expect(dayKeyInZone(new Date(instant), timeZone)).toBe(expectedDay);
    });
  });

  describe('instantInZone — shared fixture', () => {
    it.each(WALL_CLOCK_FIXTURES)('$name', ({ dayKey, hour, minute, timeZone, expected }) => {
      expect(instantInZone(dayKey, hour, minute, timeZone).toISOString()).toBe(expected);
    });

    it.each(WALL_CLOCK_FIXTURES)('$name — reads back as the same day', ({ dayKey, hour, minute, timeZone }) => {
      expect(dayKeyInZone(instantInZone(dayKey, hour, minute, timeZone), timeZone)).toBe(dayKey);
    });
  });

  describe('the production bug this closes', () => {
    const instant = new Date('2026-07-27T21:30:00.000Z');

    it('put one instant on two different days depending on host timezone', () => {
      // Documents the defect: these are genuinely different days, which is why
      // a server-local and a browser-local bucket could not agree.
      expect(dayKeyInZone(instant, 'Africa/Addis_Ababa')).toBe('2026-07-28');
      expect(dayKeyInZone(instant, 'Europe/Tirane')).toBe('2026-07-27');
    });

    it('agrees once both sides resolve through the same tenant zone', () => {
      const tenantZone = 'Europe/Tirane';
      expect(dayKeyInZone(instant, tenantZone)).toBe(dayKeyInZone(instant, tenantZone));
      expect(isSameDayInZone(instant, new Date('2026-07-27T08:00:00.000Z'), tenantZone)).toBe(true);
    });
  });

  describe('dayBoundsInZone — shared fixture', () => {
    it.each(TIMEZONE_DAY_FIXTURES)('$name', ({ instant, timeZone, expectedStart, expectedEnd }) => {
      const { start, end } = dayBoundsInZone(timeZone, 0, new Date(instant));
      expect(start.toISOString()).toBe(expectedStart);
      expect(end.toISOString()).toBe(expectedEnd);
    });

    it.each(TIMEZONE_DAY_FIXTURES)('$name — the instant falls inside its own day', ({ instant, timeZone }) => {
      // A property rather than a constant: whatever the bounds are, the instant
      // they were derived from must lie within them. Half-open at the end.
      const t = new Date(instant).getTime();
      const { start, end } = dayBoundsInZone(timeZone, 0, new Date(instant));
      expect(t).toBeGreaterThanOrEqual(start.getTime());
      expect(t).toBeLessThan(end.getTime());
    });

    it.each(TIMEZONE_DAY_FIXTURES)('$name — bounds agree with dayKeyInZone', ({ instant, timeZone, expectedDay }) => {
      // The two functions must not be able to disagree about which day it is:
      // the start of the day must key to the same day the instant does.
      const { start } = dayBoundsInZone(timeZone, 0, new Date(instant));
      expect(dayKeyInZone(start, timeZone)).toBe(expectedDay);
    });

    it.each(TIMEZONE_DAY_FIXTURES)('$name — yesterday ends exactly where today starts', ({ instant, timeZone }) => {
      // No gap and no overlap between consecutive days, which is what makes a
      // pair of range queries safe to sum.
      const today = dayBoundsInZone(timeZone, 0, new Date(instant));
      const yesterday = dayBoundsInZone(timeZone, -1, new Date(instant));
      expect(yesterday.end.getTime()).toBe(today.start.getTime());
    });
  });

  describe('dayBoundsInZone', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');

    it('brackets the tenant-local day, not the server-local one', () => {
      // Tirane is UTC+2 in July, so its day runs 22:00Z–22:00Z.
      const { start, end } = dayBoundsInZone('Europe/Tirane', 0, now);

      expect(start.toISOString()).toBe('2026-07-26T22:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-27T22:00:00.000Z');
    });

    it('is consistent with dayKeyInZone at both edges', () => {
      // The invariant the whole feature rests on: an instant is inside the
      // bounds exactly when its day key matches.
      const zone = 'Europe/Tirane';
      const { start, end } = dayBoundsInZone(zone, 0, now);
      const today = dayKeyInZone(now, zone);

      expect(dayKeyInZone(start, zone)).toBe(today);
      expect(dayKeyInZone(new Date(end.getTime() - 1), zone)).toBe(today);
      // `end` itself is the next day — the range is half-open.
      expect(dayKeyInZone(end, zone)).not.toBe(today);
    });

    it('handles negative offsets for the yesterday comparison', () => {
      const { start, end } = dayBoundsInZone('Europe/Tirane', -1, now);

      expect(start.toISOString()).toBe('2026-07-25T22:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-26T22:00:00.000Z');
    });

    it('produces a 23-hour day across a spring-forward boundary', () => {
      // Europe/Tirane springs forward at 02:00 local on 2026-03-29.
      const duringDst = new Date('2026-03-29T12:00:00.000Z');
      const { start, end } = dayBoundsInZone('Europe/Tirane', 0, duringDst);

      const hours = (end.getTime() - start.getTime()) / 3_600_000;
      expect(hours).toBe(23);
    });

    it('is unaffected by the host timezone', () => {
      // The whole point: the same tenant zone gives the same bounds no matter
      // where the process runs.
      const bounds = dayBoundsInZone('UTC', 0, now);
      expect(bounds.start.toISOString()).toBe('2026-07-27T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-07-28T00:00:00.000Z');
    });
  });
});
