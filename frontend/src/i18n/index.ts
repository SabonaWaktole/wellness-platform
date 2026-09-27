import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  SOURCE_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES,
  isSupportedLanguage,
  type Language,
} from './config';

import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enClients from '../locales/en/clients.json';
import enAppointments from '../locales/en/appointments.json';
import enInventory from '../locales/en/inventory.json';
import enQuotations from '../locales/en/quotations.json';
import enInvoices from '../locales/en/invoices.json';
import enContracts from '../locales/en/contracts.json';
import enSettings from '../locales/en/settings.json';
import enDashboard from '../locales/en/dashboard.json';
import enNotifications from '../locales/en/notifications.json';
import enForms from '../locales/en/forms.json';

import sqCommon from '../locales/sq/common.json';
import sqAuth from '../locales/sq/auth.json';
import sqClients from '../locales/sq/clients.json';
import sqAppointments from '../locales/sq/appointments.json';
import sqInventory from '../locales/sq/inventory.json';
import sqQuotations from '../locales/sq/quotations.json';
import sqInvoices from '../locales/sq/invoices.json';
import sqContracts from '../locales/sq/contracts.json';
import sqSettings from '../locales/sq/settings.json';
import sqDashboard from '../locales/sq/dashboard.json';
import sqNotifications from '../locales/sq/notifications.json';
import sqForms from '../locales/sq/forms.json';

import elCommon from '../locales/el/common.json';
import elAuth from '../locales/el/auth.json';
import elClients from '../locales/el/clients.json';
import elAppointments from '../locales/el/appointments.json';
import elInventory from '../locales/el/inventory.json';
import elQuotations from '../locales/el/quotations.json';
import elInvoices from '../locales/el/invoices.json';
import elContracts from '../locales/el/contracts.json';
import elSettings from '../locales/el/settings.json';
import elDashboard from '../locales/el/dashboard.json';
import elNotifications from '../locales/el/notifications.json';
import elForms from '../locales/el/forms.json';

import itCommon from '../locales/it/common.json';
import itAuth from '../locales/it/auth.json';
import itClients from '../locales/it/clients.json';
import itAppointments from '../locales/it/appointments.json';
import itInventory from '../locales/it/inventory.json';
import itQuotations from '../locales/it/quotations.json';
import itInvoices from '../locales/it/invoices.json';
import itContracts from '../locales/it/contracts.json';
import itSettings from '../locales/it/settings.json';
import itDashboard from '../locales/it/dashboard.json';
import itNotifications from '../locales/it/notifications.json';
import itForms from '../locales/it/forms.json';

/**
 * Catalogues are imported statically rather than fetched at runtime.
 *
 * Four languages of UI text is well under a hundred kilobytes, still smaller
 * than the loader that would fetch them — and static imports mean no async gap
 * on first paint where the interface renders raw translation keys. Namespaces
 * are still separated, so switching to lazy loading later is a config change
 * rather than a restructure.
 */
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    clients: enClients,
    appointments: enAppointments,
    inventory: enInventory,
    quotations: enQuotations,
    invoices: enInvoices,
    contracts: enContracts,
    settings: enSettings,
    dashboard: enDashboard,
    notifications: enNotifications,
    forms: enForms,
  },
  sq: {
    common: sqCommon,
    auth: sqAuth,
    clients: sqClients,
    appointments: sqAppointments,
    inventory: sqInventory,
    quotations: sqQuotations,
    invoices: sqInvoices,
    contracts: sqContracts,
    settings: sqSettings,
    dashboard: sqDashboard,
    notifications: sqNotifications,
    forms: sqForms,
  },
  el: {
    common: elCommon,
    auth: elAuth,
    clients: elClients,
    appointments: elAppointments,
    inventory: elInventory,
    quotations: elQuotations,
    invoices: elInvoices,
    contracts: elContracts,
    settings: elSettings,
    dashboard: elDashboard,
    notifications: elNotifications,
    forms: elForms,
  },
  it: {
    common: itCommon,
    auth: itAuth,
    clients: itClients,
    appointments: itAppointments,
    inventory: itInventory,
    quotations: itQuotations,
    invoices: itInvoices,
    contracts: itContracts,
    settings: itSettings,
    dashboard: itDashboard,
    notifications: itNotifications,
    forms: itForms,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  // English backs every other language: a key not yet translated renders the
  // English text rather than the raw key. A half-translated interface is
  // usable; one showing `settings:company.profile.title` is not.
  fallbackLng: SOURCE_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: [...NAMESPACES],
  defaultNS: DEFAULT_NAMESPACE,
  interpolation: {
    // React escapes on render already; escaping here would double-encode.
    escapeValue: false,
  },
  returnNull: false,
});

/**
 * The single place the interface language is set.
 *
 * Deliberately narrow: it accepts only a supported language and ignores
 * anything else, so a stale value from an old session or a hand-edited
 * preference cannot leave the app rendering keys.
 *
 * Note what this does NOT touch: no Intl formatter, no tenant locale. Interface
 * language and formatting locale are independent settings.
 */
export function applyLanguage(language: unknown): Language {
  const next = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
  if (i18n.language !== next) {
    void i18n.changeLanguage(next);
  }
  // `lang` drives hyphenation, spellcheck and screen-reader pronunciation, and
  // was hard-coded to "en" in index.html.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
  }
  return next;
}

export default i18n;
