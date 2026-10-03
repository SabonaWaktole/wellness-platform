/**
 * Supported UI languages.
 *
 * This is the *interface* language and is deliberately NOT the same thing as
 * `Tenant.locale`, which governs number, date and currency formatting. A user
 * reading the app in Albanian still sees amounts and dates in whatever locale
 * their workspace has configured. The two settings are orthogonal by design —
 * see the regression test in useMoneyFormat.test.ts, which fails if anyone
 * wires the i18n language into an Intl formatter.
 */
export const SUPPORTED_LANGUAGES = ['sq', 'en', 'el', 'it'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * What the interface is in before anyone signs in, and for anyone who has not
 * chosen a language in a workspace that has not set one (FR-LNG-01). Wellness
 * Albania works in Albanian; English is the second language.
 */
export const DEFAULT_LANGUAGE: Language = 'sq';

/**
 * The catalogue every other one is written from and checked against
 * (`scripts/check-translations.mjs`), which makes it the only one guaranteed to
 * hold every key. That is why a missing key falls back to it rather than to
 * DEFAULT_LANGUAGE: Greek and Italian may lag behind, and English is the text
 * they fall back to.
 */
export const SOURCE_LANGUAGE: Language = 'en';

/**
 * Endonyms — each language named in itself, which is what someone who cannot
 * read the current interface language needs in order to find their own.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  sq: 'Shqip',
  el: 'Ελληνικά',
  it: 'Italiano',
};

export const isSupportedLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/**
 * Namespaces mirror the feature/route split, so a component's namespace is
 * predictable from its path.
 *
 * There is deliberately no `errors` namespace: server error messages stay in
 * English for the MVP, and creating a home for them would imply otherwise. See
 * TD-016.
 */
export const NAMESPACES = [
  'common',
  'auth',
  'clients',
  'appointments',
  'inventory',
  'quotations',
  'invoices',
  'contracts',
  'settings',
  'dashboard',
  'notifications',
  'forms',
  'audit',
  'deals',
  'pricing',
  'offers',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = 'common';
