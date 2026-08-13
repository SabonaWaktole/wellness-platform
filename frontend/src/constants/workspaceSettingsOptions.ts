import { SUPPORTED_LOCALES, DATE_FORMATS } from '../hooks/useTenantSettings';

/**
 * Shared between a workspace's own Settings page and the platform console's
 * Settings page (platform defaults + bulk apply) — both edit the same six
 * fields, so the picker contents must not drift between them.
 */

/**
 * The currencies offered in the picker.
 *
 * A short list rather than all 162 ISO codes: a dropdown of every currency on
 * earth is worse to use than a short one, and the server validates against the
 * full `Intl.supportedValuesOf('currency')` set regardless — so this list can
 * grow without any server change.
 */
export const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar ($)' },
  { code: 'AUD', label: 'AUD — Australian Dollar ($)' },
  { code: 'ALL', label: 'ALL — Albanian Lek (L)' },
];

/**
 * A curated fallback, used only if the runtime can't produce the full IANA
 * set below (see TIMEZONE_OPTIONS).
 */
const TIMEZONE_FALLBACK = [
  'UTC',
  'Europe/Tirane',
  'Europe/London',
  'Europe/Berlin',
  'Africa/Addis_Ababa',
  'Africa/Nairobi',
  'Africa/Lagos',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * The full IANA timezone set the browser knows about — matches what the
 * server validates against (`Intl.supportedValuesOf('timeZone')`), so every
 * zone the server accepts is selectable here. Falls back to a short curated
 * list on runtimes that don't support `Intl.supportedValuesOf`.
 */
export const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone').sort((a, b) =>
        a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)
      )
    : TIMEZONE_FALLBACK;

export const LOCALE_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  'en-US': 'English (United States) — 1,234.56',
  'en-GB': 'English (United Kingdom) — 1,234.56',
  'sq-AL': 'Albanian (Albania) — 1 234,56',
  'el-GR': 'Greek (Greece) — 1.234,56',
  'it-IT': 'Italian (Italy) — 1.234,56',
};

/**
 * Labelled with a worked example (today, fixed rather than computed, so the
 * picker doesn't visibly change every day) so the day/month/year order is
 * obvious without having to already know what "MM/DD/YYYY" means.
 */
export const DATE_FORMAT_LABELS: Record<(typeof DATE_FORMATS)[number], string> = {
  'MM/DD/YYYY': 'MM/DD/YYYY — 08/13/2026',
  'DD/MM/YYYY': 'DD/MM/YYYY — 13/08/2026',
  'YYYY-MM-DD': 'YYYY-MM-DD — 2026-08-13',
};
