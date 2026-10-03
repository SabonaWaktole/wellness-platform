import type { TFunction } from 'i18next';

interface ApiError {
  response?: { status?: number; data?: { code?: string; reason?: string } };
}

const CODES = [
  'OFFER_NOT_READY',
  'OFFER_INVALID_TRANSITION',
  'OFFER_NOT_LATEST',
  'OFFER_NOT_EDITABLE',
  'OFFER_REVISE_FIRST',
  'INVALID_SENT_DATE',
];

/** A translated message for a refused offer step (FR-OFR-09..12). */
export function offerErrorMessage(error: unknown, t: TFunction): string {
  const response = (error as ApiError)?.response;
  if (response?.status === 404) return t('offers:errors.notFound');
  if (response?.status === 403) return t('offers:errors.forbidden');
  const { code, reason } = response?.data ?? {};
  if (code === 'OFFER_NOT_READY' && reason) return t(`offers:errors.notReady.${reason}`, { defaultValue: t('offers:errors.OFFER_NOT_READY') });
  if (code && CODES.includes(code)) return t(`offers:errors.${code}`);
  return t('offers:errors.generic');
}
