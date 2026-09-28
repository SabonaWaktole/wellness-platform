import type { TFunction } from 'i18next';

const KNOWN_CODES = [
  'LAST_ROLE_MANAGER',
  'ROLE_NAME_TAKEN',
  'ROLE_IN_USE',
  'SYSTEM_ROLE_LOCKED',
  'INVALID_PERMISSION_GRANT',
  'ROLE_NOT_FOUND',
];

/** The roles API's refusals, in the user's language; anything else is the generic message. */
export function rolesErrorMessage(err: any, t: TFunction): string {
  const code = err?.response?.data?.code;
  return KNOWN_CODES.includes(code) ? t(`roles.errors.${code}`) : t('roles.errors.generic');
}
