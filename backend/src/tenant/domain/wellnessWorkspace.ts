import type { DateFormat, Language, SupportedLocale } from './entities/Tenant';

/**
 * The workspace this edition runs as. Wellness Albania is one tenant in the
 * multi-tenant infrastructure (SRS §2.5).
 */
export const WELLNESS_WORKSPACE = {
  name: 'Wellness Albania',
  urlSlug: 'wellness-albania',
} as const;

/**
 * Where a Wellness Albania workspace starts (FR-LNG-01, FR-LNG-04): an
 * Albanian interface, Albanian number and date conventions, Tirana time and
 * euros — the currency of the price lists (the micro-business pricing model,
 * the Wellness+ tiers). Every value can be changed later in the workspace
 * settings; this is only the starting point.
 */
export const ALBANIA_WORKSPACE_DEFAULTS: {
  defaultLanguage: Language;
  locale: SupportedLocale;
  timezone: string;
  dateFormat: DateFormat;
  currency: string;
} = {
  defaultLanguage: 'sq',
  locale: 'sq-AL',
  timezone: 'Europe/Tirane',
  dateFormat: 'DD.MM.YYYY',
  currency: 'EUR',
};
