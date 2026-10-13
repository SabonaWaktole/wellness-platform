import React from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_LABELS, type Language } from '../../../i18n/config';
import { useVisitorLanguageStore } from '../../../store/useVisitorLanguageStore';
import styles from './AuthLayout.module.css';

/** English first (the default), then Albanian; Greek and Italian are still in review. */
const OFFERED: Language[] = ['en', 'sq'];

/**
 * English / Shqip on every signed-out screen. Each language is named in
 * itself, so a visitor who cannot read the current one still finds theirs.
 * The choice is remembered in this browser and gives way to the user's own
 * preference once they sign in.
 */
export const VisitorLanguageSwitch: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const chosen = useVisitorLanguageStore((state) => state.language);
  const setLanguage = useVisitorLanguageStore((state) => state.setLanguage);
  const current = chosen ?? (OFFERED.includes(i18n.language as Language) ? (i18n.language as Language) : DEFAULT_LANGUAGE);

  return (
    <div className={styles.languageSwitch} role="group" aria-label={t('language.switchLabel')}>
      {OFFERED.map((language) => (
        <button
          key={language}
          type="button"
          lang={language}
          aria-pressed={current === language}
          onClick={() => setLanguage(language)}
        >
          {LANGUAGE_LABELS[language]}
        </button>
      ))}
    </div>
  );
};
