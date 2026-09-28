import type { TFunction } from 'i18next';

const KNOWN_CODES = ['LAST_ROLE_MANAGER', 'REASSIGNMENT_REQUIRED', 'INVALID_REASSIGNMENT_TARGET', 'UNKNOWN_ROLE'];

/** The API's user-administration refusals, in the user's language; anything else falls back to `fallback`. */
export function teamErrorMessage(err: any, t: TFunction, fallback: string): string {
  const code = err?.response?.data?.code;
  return KNOWN_CODES.includes(code) ? t(`team.errors.${code}`) : fallback;
}
