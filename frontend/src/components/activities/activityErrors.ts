import type { TFunction } from 'i18next';

interface ApiError {
  response?: { status?: number; data?: { code?: string; field?: string } };
}

/** The field an activity error names (400 INVALID_ACTIVITY), so the dialog can show it beside that input. */
export function activityErrorField(error: unknown): string | null {
  const data = (error as ApiError)?.response?.data;
  return data?.code === 'INVALID_ACTIVITY' && data.field ? data.field : null;
}

/** A translated message for a failed activity save, by field, by code, or a generic one. */
export function activityErrorMessage(error: unknown, t: TFunction): string {
  const response = (error as ApiError)?.response;
  const field = activityErrorField(error);
  if (field) return t(`clients:activity.errors.${field}`, { defaultValue: t('clients:activity.errors.generic') });
  if (response?.data?.code === 'ACTIVITY_EDIT_CLOSED') return t('clients:activity.errors.editClosed');
  if (response?.status === 403) return t('clients:activity.errors.forbidden');
  if (response?.status === 404) return t('clients:activity.errors.notFound');
  return t('clients:activity.errors.generic');
}
