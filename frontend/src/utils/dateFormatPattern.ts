/**
 * Explicit day/month/year ORDERING for the whole app (TD-012's resolution).
 *
 * `locale` still decides how each field looks — digit glyphs, written month
 * names, AM/PM. `pattern` decides the order those fields appear in. The two
 * used to both claim ordering (locale implicitly, `dateFormat` on paper but
 * never wired up), which is exactly the disagreement that kept this disabled.
 * Now `pattern` wins: it is read here, nowhere else invents an order.
 *
 * Framework-free so it works both inside the authenticated app (`useDateFormat`,
 * fed from the auth store) and on the public quotation page, which has no auth
 * store and gets the tenant's format handed to it in the API response instead.
 */
export const DATE_FORMAT_PATTERNS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD'] as const;
export type DateFormatPattern = (typeof DATE_FORMAT_PATTERNS)[number];

export const FALLBACK_DATE_FORMAT: DateFormatPattern = 'MM/DD/YYYY';

const numericFormatterCache = new Map<string, Intl.DateTimeFormat>();

function numericFormatter(locale: string, timeZone?: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? ''}`;
  const cached = numericFormatterCache.get(key);
  if (cached) return cached;

  const made = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
  numericFormatterCache.set(key, made);
  return made;
}

function numericParts(date: Date, locale: string, timeZone?: string) {
  const parts = numericFormatter(locale, timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year') };
}

/** Short numeric date in `pattern`'s order, e.g. `13/08/2026`. */
export function formatDatePattern(
  date: Date,
  locale: string,
  pattern: string,
  timeZone?: string
): string {
  const { day, month, year } = numericParts(date, locale, timeZone);
  switch (pattern as DateFormatPattern) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    // The Albanian convention, and Wellness Albania's workspace default.
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
}

/**
 * Date with a written month, in `pattern`'s day/month/year order, e.g.
 * `13 Aug 2026`. There is no digit slot for the month to disagree over, but
 * the day-before-month-vs-after split still follows `pattern` rather than
 * silently falling back to locale, which is the exact inconsistency this
 * whole mechanism exists to avoid.
 */
export function formatDateMediumPattern(
  date: Date,
  locale: string,
  pattern: string,
  timeZone?: string
): string {
  const { day, year } = numericParts(date, locale, timeZone);
  const month = new Intl.DateTimeFormat(locale, {
    month: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);

  switch (pattern as DateFormatPattern) {
    case 'DD/MM/YYYY':
    case 'DD.MM.YYYY':
      return `${day} ${month} ${year}`;
    case 'YYYY-MM-DD':
      return `${year} ${month} ${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month} ${day}, ${year}`;
  }
}
