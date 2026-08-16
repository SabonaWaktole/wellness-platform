import { useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { dayKeyInZone, isSameDayInZone, dayBoundsInZone } from '../utils/tenantDay';
import { formatDatePattern, formatDateMediumPattern, FALLBACK_DATE_FORMAT } from '../utils/dateFormatPattern';

/**
 * Date and time formatting bound to the workspace's settings.
 *
 * Three distinct settings feed this, and conflating them is the mistake to avoid:
 *
 *   - `tenantTimezone` decides WHICH DAY an instant falls on. It is a
 *     correctness concern: get it wrong and an appointment appears on the wrong
 *     date, or a dashboard count disagrees with the calendar.
 *   - `tenantDateFormat` decides the ORDER day/month/year appear in. This is
 *     the source of truth for ordering — see `utils/dateFormatPattern.ts`.
 *   - `tenantLocale` decides everything else about HOW a date is written
 *     (digit glyphs, written month names, AM/PM). Purely presentational, and
 *     no longer has a say in ordering. See TD-012.
 *
 * Neither is the UI language. A user reading the interface in Albanian still
 * sees dates in their workspace's configured conventions — see the regression
 * test in i18n/orthogonality.test.tsx.
 */
export const FALLBACK_TIMEZONE = 'UTC';
export const FALLBACK_LOCALE = 'en-US';

const cache = new Map<string, Intl.DateTimeFormat>();

const formatter = (
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const made = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  cache.set(key, made);
  return made;
};

type DateInput = Date | string | number;

const toDate = (value: DateInput): Date =>
  value instanceof Date ? value : new Date(value);

export function useDateFormat() {
  const timeZone = useAuthStore((state) => state.user?.tenantTimezone) ?? FALLBACK_TIMEZONE;
  const locale = useAuthStore((state) => state.user?.tenantLocale) ?? FALLBACK_LOCALE;
  const dateFormat = useAuthStore((state) => state.user?.tenantDateFormat) ?? FALLBACK_DATE_FORMAT;

  return useMemo(
    () => ({
      timeZone,
      locale,
      dateFormat,

      /** Short calendar date, ordered per `dateFormat`, e.g. 07/27/2026. */
      date: (value: DateInput) => formatDatePattern(toDate(value), locale, dateFormat, timeZone),

      /** Date with a written month, ordered per `dateFormat`, for detail views. */
      dateMedium: (value: DateInput) =>
        formatDateMediumPattern(toDate(value), locale, dateFormat, timeZone),

      /** Time of day only. */
      time: (value: DateInput) =>
        formatter(locale, timeZone, { hour: '2-digit', minute: '2-digit' }).format(toDate(value)),

      /** Date and time together, for timeline entries and audit rows. */
      dateTime: (value: DateInput) =>
        `${formatDateMediumPattern(toDate(value), locale, dateFormat, timeZone)}, ${formatter(
          locale,
          timeZone,
          { hour: '2-digit', minute: '2-digit' }
        ).format(toDate(value))}`,

      /** Arbitrary options, still pinned to the tenant's zone and locale. */
      custom: (value: DateInput, options: Intl.DateTimeFormatOptions) =>
        formatter(locale, timeZone, options).format(toDate(value)),

      /** Grouping helpers, so callers never reach for browser-local dates. */
      dayKey: (value: DateInput) => dayKeyInZone(toDate(value), timeZone),
      isSameDay: (a: DateInput, b: DateInput) => isSameDayInZone(toDate(a), toDate(b), timeZone),
      /**
       * The `[start, end)` instants of a tenant-local day. `offsetDays` is
       * relative to now: `0` today, `-1` yesterday.
       *
       * Use this for any "today" range query instead of `setHours(0,0,0,0)`,
       * which resolves midnight in the *browser's* zone and so disagrees with
       * every server-computed figure beside it. TD-029.
       */
      dayBounds: (offsetDays = 0) => dayBoundsInZone(timeZone, offsetDays),
    }),
    [locale, timeZone, dateFormat]
  );
}
