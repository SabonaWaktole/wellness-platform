import type { TFunction } from 'i18next';

const KNOWN_CODES = [
  'INVALID_FEE',
  'INVALID_PERCENT',
  'INVALID_BAND_RANGE',
  'INVALID_PRICING_VALUE',
  'CITY_NOT_ACTIVE',
  'PRICING_VALUE_TAKEN',
  'PRICING_ITEM_NOT_FOUND',
  'INVALID_PRICING_ORDER',
  'SERVICE_NOT_ACTIVE',
  'PACKAGE_NEEDS_SERVICE',
  'INVALID_RICH_TEXT',
];

/** Refusals that name the values in the way (FR-PCF-06). */
const CONFLICT_CODES = ['PRICING_ITEM_IN_USE', 'DEFAULT_PACKAGE_REQUIRED', 'SERVICE_LAST_IN_PACKAGE'];

/** The pricing API's refusals, in the user's language; anything else is the generic message. */
export function pricingErrorMessage(err: any, t: TFunction): string {
  const data = err?.response?.data;
  const code = data?.code;
  if (code === 'BANDS_OVERLAP') {
    return t('pricing.errors.BANDS_OVERLAP', { min: data.overlapsWith?.minEmployees, max: data.overlapsWith?.maxEmployees });
  }
  if (CONFLICT_CODES.includes(code)) {
    return t(`pricing.errors.${code}`, { names: (data.names ?? []).join(', '), count: data.names?.length ?? 0 });
  }
  if (code === 'INVALID_OFFER_SETTING') return t(`pricing.offer.errors.${data.field}`, { defaultValue: t('pricing.errors.INVALID_PRICING_VALUE') });
  if (KNOWN_CODES.includes(code)) return t(`pricing.errors.${code}`);
  if (err?.response?.status === 400) return t('pricing.errors.INVALID_PRICING_VALUE');
  return t('pricing.errors.generic');
}
