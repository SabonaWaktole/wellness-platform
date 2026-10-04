/**
 * "What day is it?" resolved in a tenant's configured timezone.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS DUPLICATED IN THE FRONTEND: `frontend/src/utils/tenantDay.ts`.
 *
 * Backend and frontend are separate packages with no shared module path
 * (`backend/tsconfig.json` includes only `src/**` and there is no workspace
 * root), so the definition of a calendar day cannot physically live in one
 * place. It is therefore duplicated, and kept honest by an identical fixture
 * table asserted in BOTH test suites:
 *
 *   backend/tests/unit/shared/tenantDay.test.ts
 *   frontend/src/utils/tenantDay.test.ts
 *
 * If you change the logic here, change it there, and both suites will tell you
 * if you did not. That is not a hope: the fixture table was verified to catch a
 * deliberately drifted copy — replacing the day-end calculation with a naive
 * `start + 24h` fails exactly the two DST rows, on the drifted side only.
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
 * Why this exists at all: before it, three different notions of "day" were in
 * use simultaneously —
 *
 *   1. the dashboard KPI bucketed by the SERVER host's timezone
 *      (`new Date(); setHours(0,0,0,0)`),
 *   2. the calendar queue bucketed by the BROWSER's timezone (`isSameDayLocal`),
 *   3. the calendar grid re-implemented (2) inline.
 *
 * (2) and (3) agreed with each other; neither agreed with (1). With the server
 * on UTC+3 and a user on UTC+2, an appointment at 21:30Z was "today" on the
 * dashboard and "tomorrow" on the calendar. All three now resolve through the
 * tenant's timezone instead.
 */

/**
 * The tenant-local calendar day of an instant, as `YYYY-MM-DD`.
 *
 * Formatting rather than arithmetic on purpose: `Intl` owns the IANA rules,
 * including DST transitions and historical offset changes, and gets them right
 * without any offset maths of ours.
 *
 * `en-CA` is used because it yields ISO-ordered `YYYY-MM-DD`, which sorts and
 * compares as a plain string. It is a formatting detail, unrelated to the
 * tenant's display locale.
 */
export function dayKeyInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** True when both instants fall on the same calendar day in `timeZone`. */
export function isSameDayInZone(a: Date, b: Date, timeZone: string): boolean {
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
 * straight to a `scheduledAt: { gte: start, lt: end }` query.
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
 * Mirrored in the frontend since M2 Slice 12, where a drag on the calendar
 * turns a time slot into an instant (before that the frontend sent the day and
 * the time and the server did it: follow-up due times, FR-FUP-01).
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
