import type { TFunction } from 'i18next';

const KNOWN_CODES = [
  'LOOKUP_ITEM_NOT_FOUND',
  'INVALID_LOOKUP_VALUE',
  'LOOKUP_VALUE_TAKEN',
  'RISK_LEVEL_INACTIVE',
  'LOOKUP_ITEM_IN_USE',
  'RISK_LEVEL_STILL_USED',
  'INVALID_LOOKUP_ORDER',
];

/** The lists API's refusals, in the user's language; anything else is the generic message. */
export function lookupErrorMessage(err: any, t: TFunction): string {
  const data = err?.response?.data;
  const code = data?.code;
  if (code === 'LOOKUP_VALUE_TAKEN' && data?.field === 'level') return t('lists.errors.LEVEL_TAKEN');
  if (code === 'RISK_LEVEL_STILL_USED') return t('lists.errors.RISK_LEVEL_STILL_USED', { count: data.activeBusinessTypes });
  if (KNOWN_CODES.includes(code)) return t(`lists.errors.${code}`);
  if (err?.response?.status === 400) return t('lists.errors.INVALID_LOOKUP_VALUE');
  return t('lists.errors.generic');
}
