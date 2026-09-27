import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { applyLanguage } from './index';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from './config';

/**
 * Resolves which language the interface should be in.
 *
 * Precedence is `user override -> workspace default -> DEFAULT_LANGUAGE`
 * (Albanian). The user field
 * is nullable precisely so "follow the workspace default" is expressible: a
 * user who has never chosen tracks their tenant's setting, including when the
 * tenant later changes it, while a user who has chosen keeps their choice.
 */
export function resolveLanguage(
  userLanguage: string | null | undefined,
  tenantDefaultLanguage: string | null | undefined
): Language {
  if (isSupportedLanguage(userLanguage)) return userLanguage;
  if (isSupportedLanguage(tenantDefaultLanguage)) return tenantDefaultLanguage;
  return DEFAULT_LANGUAGE;
}

/**
 * Keeps i18next in step with the signed-in user.
 *
 * Mounted once, near the root. Reads only language fields — it must never touch
 * `tenantLocale` or `tenantCurrency`, which belong to the formatting hooks.
 */
export function useLanguageSync(): Language {
  const userLanguage = useAuthStore((state) => state.user?.userLanguage);
  const tenantDefaultLanguage = useAuthStore((state) => state.user?.tenantDefaultLanguage);

  const language = resolveLanguage(userLanguage, tenantDefaultLanguage);

  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  return language;
}

/**
 * Re-exported so components import translation and language handling from one
 * place rather than reaching into react-i18next directly.
 */
export { useTranslation };
