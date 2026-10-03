import type { TFunction } from 'i18next';

interface ApiError {
  response?: { status?: number; data?: { code?: string; field?: string } };
}

const CODES = ['DISCOUNT_ABOVE_CAP', 'COMPANY_INCOMPLETE', 'OFFER_NOT_EDITABLE', 'OFFER_REVISE_FIRST', 'INVALID_PERCENT'];

/** A translated message for a failed calculation or save on the pricing screen. */
export function pricingScreenError(error: unknown, t: TFunction): string {
  const response = (error as ApiError)?.response;
  if (response?.status === 404) return t('pricing:errors.notFound');
  if (response?.status === 403) return t('pricing:errors.forbidden');
  const { code, field } = response?.data ?? {};
  if (code && CODES.includes(code)) return t(`pricing:errors.${code}`);
  if (code === 'INVALID_PRICING_INPUT' && field) {
    return t(`pricing:errors.fields.${field}`, { defaultValue: t('pricing:errors.INVALID_PRICING_INPUT') });
  }
  return t('pricing:errors.generic');
}
