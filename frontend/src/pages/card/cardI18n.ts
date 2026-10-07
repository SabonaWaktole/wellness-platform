import i18next from 'i18next';
import en from '../../locales/en/card.json';
import sq from '../../locales/sq/card.json';
import el from '../../locales/el/card.json';
import it from '../../locales/it/card.json';

export const CARD_LANGUAGES = ['sq', 'en', 'el', 'it'] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

/**
 * The card page has its own i18n instance and its own small namespace (M4 rule 8, D19), so the public bundle does
 * not carry the staff catalogues and the member's language does not depend on, or change, the app's language.
 * Albanian is the default and English the fallback; Greek and Italian are used for members who have them.
 *
 * It is deliberately NOT registered with `initReactI18next`: that plugin makes an instance the global default, and the
 * `/v/:token` page can hand over to the staff app without a reload, where `useTranslation('members')` must keep
 * resolving against the app's own instance. Every card component passes `{ i18n: cardI18n }` explicitly.
 */
export const cardI18n = i18next.createInstance();

void cardI18n.init({
  lng: 'sq',
  fallbackLng: 'en',
  supportedLngs: [...CARD_LANGUAGES],
  defaultNS: 'card',
  ns: ['card'],
  resources: { en: { card: en }, sq: { card: sq }, el: { card: el }, it: { card: it } },
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

export const isCardLanguage = (value: unknown): value is CardLanguage => (CARD_LANGUAGES as readonly string[]).includes(value as string);
