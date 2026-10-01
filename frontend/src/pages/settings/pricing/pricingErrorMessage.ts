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
];

/** The pricing API's refusals, in the user's language; anything else is the generic message. */
export function pricingErrorMessage(err: any, t: TFunction): string {
  const data = err?.response?.data;
  const code = data?.code;
  if (code === 'BANDS_OVERLAP') {
    return t('pricing.errors.BANDS_OVERLAP', { min: data.overlapsWith?.minEmployees, max: data.overlapsWith?.maxEmployees });
  }
  if (KNOWN_CODES.includes(code)) return t(`pricing.errors.${code}`);
  if (err?.response?.status === 400) return t('pricing.errors.INVALID_PRICING_VALUE');
  return t('pricing.errors.generic');
}
