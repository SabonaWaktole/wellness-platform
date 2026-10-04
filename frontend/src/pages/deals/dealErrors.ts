import type { TFunction } from 'i18next';

interface ApiError {
  response?: { status?: number; data?: { code?: string; field?: string } };
}

/** The field a deal error names (400 INVALID_DEAL), so the form can show it beside that input. */
export function dealErrorField(error: unknown): string | null {
  const data = (error as ApiError)?.response?.data;
  return data?.code === 'INVALID_DEAL' && data.field ? data.field : null;
}

/** A translated message for a failed deal request, by field, by code, or a generic one. */
export function dealErrorMessage(error: unknown, t: TFunction): string {
  const response = (error as ApiError)?.response;
  const field = dealErrorField(error);
  if (field) return t(`deals:errors.fields.${field}`, { defaultValue: t('deals:errors.INVALID_DEAL') });
  if (response?.status === 403) return t('deals:errors.forbidden');
  const code = response?.data?.code;
  if (code === 'DEAL_STAGE_NOT_ALLOWED' || code === 'DEAL_NOT_FOUND' || code === 'DEAL_NOT_WINNABLE') return t(`deals:errors.${code}`);
  return t('deals:errors.generic');
}
