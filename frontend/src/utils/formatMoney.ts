/**
 * Money formatting for the whole app.
 *
 * Before this existed there were nine ways to render an amount: one real
 * Intl formatter hard-coded to USD, seven places that glued a literal '$' onto
 * a number, and three private `formatMoney` helpers that emitted a bare number
 * with no currency indicator at all. A tenant's configured currency could not
 * have been honoured by changing any single one of them.
 */

/** Mirrors the backend column defaults, for the pre-login and SUPER_ADMIN cases. */
export const FALLBACK_CURRENCY = 'USD';
export const FALLBACK_LOCALE = 'en-US';

export interface MoneyFormatSettings {
  currency?: string | null;
  locale?: string | null;
}

const resolve = (settings: MoneyFormatSettings) => ({
  currency: settings.currency || FALLBACK_CURRENCY,
  locale: settings.locale || FALLBACK_LOCALE,
});

/**
 * Intl formatters are comparatively expensive to construct and are used inside
 * render paths and table rows, so they are built once per settings combination.
 */
const cache = new Map<string, Intl.NumberFormat>();

/**
 * `exact` shows the currency's own sub-unit precision and suits line items and
 * prices. `whole` drops sub-units and suits large aggregates — KPI tiles and
 * chart tooltips, which read as noise with a trailing `.00`. `compact`
 * abbreviates for axis ticks.
 *
 * The whole/exact distinction is preserved from the helpers this replaced
 * rather than invented: the inventory KPI and the revenue tooltip both already
 * used `maximumFractionDigits: 0` on purpose.
 *
 * `exact` deliberately sets NO fraction digits of its own. It used to force
 * `{ minimumFractionDigits: 2, maximumFractionDigits: 2 }`, which overrode the
 * currency's real precision and invented sub-units for currencies that have
 * none: Japanese Yen rendered as `¥1,234.50` and Albanian Lek as `1234,50 Lekë`,
 * when neither currency has a hundredth. Leaving it to Intl means USD gets 2
 * digits, JPY and ALL get 0, and a currency with 3 (e.g. KWD) gets 3 — each
 * from the same CLDR table the API validates codes against.
 */
type Precision = 'exact' | 'whole' | 'compact';

const OPTIONS: Record<Precision, Intl.NumberFormatOptions> = {
  exact: {},
  whole: { maximumFractionDigits: 0 },
  compact: { notation: 'compact', maximumFractionDigits: 1 },
};

const formatterFor = (locale: string, currency: string, precision: Precision): Intl.NumberFormat => {
  const key = `${locale}|${currency}|${precision}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...OPTIONS[precision],
  });

  cache.set(key, formatter);
  return formatter;
};

/**
 * `null` renders as an em dash rather than as zero — the inventory table needs
 * to distinguish "no price set" from "free", and they are not the same fact.
 */
export function formatMoney(
  value: number | string | null | undefined,
  settings: MoneyFormatSettings = {}
): string {
  if (value === null || value === undefined) return '—';
  const { locale, currency } = resolve(settings);
  // The API sends money as a two-decimal string ("49.40"); it is shown, never calculated with.
  return formatterFor(locale, currency, 'exact').format(Number(value));
}

/** Whole units, no cents. For aggregates: KPI tiles, chart tooltips. */
export function formatMoneyWhole(
  value: number | null | undefined,
  settings: MoneyFormatSettings = {}
): string {
  if (value === null || value === undefined) return '—';
  const { locale, currency } = resolve(settings);
  return formatterFor(locale, currency, 'whole').format(value);
}

/**
 * Abbreviated form for chart axes, where a full amount would not fit.
 *
 * This replaces a hand-rolled `` `$${...}` `` template: because the symbol was
 * concatenated rather than produced by the formatter, it stayed a dollar sign
 * no matter what. Going through Intl means the symbol follows the currency.
 */
export function formatMoneyCompact(
  value: number,
  settings: MoneyFormatSettings = {}
): string {
  const { locale, currency } = resolve(settings);
  return formatterFor(locale, currency, 'compact').format(value);
}
