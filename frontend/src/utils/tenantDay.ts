/**
 * "What day is it?" resolved in a tenant's configured timezone.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS DUPLICATED IN THE BACKEND:
 * `backend/src/shared/domain/time/tenantDay.ts`.
 *
 * Backend and frontend are separate packages with no shared module path, so the
 * definition of a calendar day cannot physically live in one place. It is
 * duplicated, and kept honest by an identical fixture table asserted in BOTH
 * test suites:
 *
 *   frontend/src/utils/tenantDay.test.ts
 *   backend/tests/unit/shared/tenantDay.test.ts
 *
 * If you change the logic here, change it there, and both suites will tell you
 * if you did not. That is not a hope: the fixture table was verified to catch a
 * deliberately drifted copy — replacing this file's day-end calculation with a
 * naive `start + 24h` fails exactly the two DST rows, on this side only.
 *
 * FOUR functions are now mirrored: dayKeyInZone, isSameDayInZone,
 * dayBoundsInZone and instantInZone (plus the private zoneOffsetMs).
 * instantInZone joined with the sales calendar (M2 Slice 12), where dropping
 * an item on a time slot has to become the right instant on a day that
 * changes its clocks; a second fixture table, WALL_CLOCK_FIXTURES, pins it in
 * both suites. Each addition raises the cost of the duplication — see TD-026
 * for the conditions under which this should become a shared package instead.
 * ---------------------------------------------------------------------------
 *
 * This replaces `isSameDayLocal`, which compared browser-local date components.
 * That was self-consistent but disagreed with the server: the dashboard's
 * "Appointments Today" KPI bucketed by the SERVER host's timezone, so with the
 * server on UTC+3 and a user on UTC+2, a 21:30Z appointment was counted as
 * "today" on the dashboard and drawn on the next day in the calendar.
 */

/**
 * The tenant-local calendar day of an instant, as `YYYY-MM-DD`.
 *
 * `en-CA` is used because it yields ISO-ordered `YYYY-MM-DD`, which compares as
 * a plain string. It is a formatting detail, unrelated to the tenant's display
 * locale — the day a thing happens on must not change because someone switched
 * their number formatting.
 */
export function dayKeyInZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** True when both instants fall on the same calendar day in `timeZone`. */
export function isSameDayInZone(
  a: Date | string,
  b: Date | string,
  timeZone: string
): boolean {
  return dayKeyInZone(a, timeZone) === dayKeyInZone(b, timeZone);
}

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant into the zone's wall-clock fields and
 * re-reading them as if they were UTC; the difference is the offset. This is
 * the standard technique for doing zone maths with `Intl` alone.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const field = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    // `hour12: false` renders midnight as 24 in some engines; normalise it.
    field('hour') % 24,
    field('minute'),
    field('second')
  );

  return asIfUtc - instant.getTime();
}

/**
 * The UTC instants bounding a tenant-local calendar day: `[start, end)`.
 *
 * `offsetDays` is relative to `now` — `0` is today in the tenant's zone, `-1`
 * yesterday. The returned bounds are real instants, so they can be handed
 * straight to an API range query.
 *
 * Added for TD-029: the staff dashboard was building its "today" range with
 * `setHours(0,0,0,0)` / `setHours(23,59,59,999)`, i.e. midnight in the
 * *browser's* zone, while the KPI directly above it used the tenant's. That is
 * the same disagreement TD-025 closed elsewhere, and it survived because the
 * frontend copy of this file had no bounds function to reach for.
 */
export function dayBoundsInZone(
  timeZone: string,
  offsetDays = 0,
  now: Date = new Date()
): { start: Date; end: Date } {
  const [year, month, day] = dayKeyInZone(now, timeZone).split('-').map(Number);

  // Midnight of the target day, expressed as if the zone were UTC.
  const midnightAsIfUtc = Date.UTC(year, month - 1, day + offsetDays, 0, 0, 0, 0);

  // Shift by the offset in effect *at that moment* rather than at `now`, so a
  // day that crosses a DST boundary still starts at the correct instant.
  const provisional = new Date(midnightAsIfUtc);
  const start = new Date(midnightAsIfUtc - zoneOffsetMs(provisional, timeZone));

  // The next day's start, computed the same way rather than by adding 24h —
  // a DST day is 23 or 25 hours long.
  const nextMidnightAsIfUtc = Date.UTC(year, month - 1, day + offsetDays + 1, 0, 0, 0, 0);
  const end = new Date(
    nextMidnightAsIfUtc - zoneOffsetMs(new Date(nextMidnightAsIfUtc), timeZone)
  );

  return { start, end };
}

/**
 * The instant at which the wall clock in `timeZone` reads `hour:minute` on
 * the calendar day `dayKey` (`YYYY-MM-DD`).
 *
 * Two passes, because the offset to subtract is the one in effect at the
 * answer, which is not known until the first guess. A wall time that a
 * spring-forward skips resolves an hour later; one that a fall-back repeats
 * resolves to its first occurrence.
 */
export function instantInZone(dayKey: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - zoneOffsetMs(new Date(firstGuess), timeZone));
}
