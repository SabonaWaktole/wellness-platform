import type { TFunction } from 'i18next';

interface ApiError {
  response?: { status?: number; data?: { code?: string; field?: string } };
}

/** The field a follow-up error names (400 INVALID_FOLLOW_UP), so a form can show it beside that input. */
export function followUpErrorField(error: unknown): string | null {
  const data = (error as ApiError)?.response?.data;
  return data?.code === 'INVALID_FOLLOW_UP' && data.field ? data.field : null;
}

/** A translated message for a failed follow-up action, by field, by code, or a generic one. */
export function followUpErrorMessage(error: unknown, t: TFunction): string {
  const response = (error as ApiError)?.response;
  const field = followUpErrorField(error);
  if (field) return t(`followUps:errors.${field}`, { defaultValue: t('followUps:errors.generic') });
  if (response?.data?.code === 'FOLLOW_UP_CLOSED') return t('followUps:errors.closed');
  if (response?.status === 404) return t('followUps:errors.notFound');
  return t('followUps:errors.generic');
}
