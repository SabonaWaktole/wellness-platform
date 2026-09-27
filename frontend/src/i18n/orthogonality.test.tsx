import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import i18n, { applyLanguage } from './index';
import { resolveLanguage } from './useLanguage';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, DEFAULT_LANGUAGE } from './config';
import { useMoneyFormat } from '../hooks/useMoneyFormat';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Interface language and formatting locale are two independent settings, and
 * this file exists to keep them that way.
 *
 * The tempting mistake is to pass `i18n.language` into an Intl constructor —
 * it reads like the obvious source of "what locale is this user in". It is not:
 * a user may read the interface in Albanian while their workspace records money
 * in US conventions, and conflating the two would silently reformat every
 * amount in the app the moment someone switched language.
 */
const setTenant = (over: Partial<NonNullable<ReturnType<typeof useAuthStore.getState>['user']>> = {}) => {
  useAuthStore.setState({
    user: {
      userId: 'u1',
      email: 'owner@example.com',
      role: 'BUSINESS_OWNER',
      tenantId: 't1',
      tenantSlug: 'acme',
      tenantCurrency: 'USD',
      tenantLocale: 'en-US',
      userLanguage: null,
      tenantDefaultLanguage: 'en',
      ...over,
    },
    isAuthenticated: true,
  });
};

describe('language and formatting are independent', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    setTenant();
  });

  it('formats money by tenant locale even when the UI is Albanian', async () => {
    setTenant({ userLanguage: 'sq', tenantCurrency: 'USD', tenantLocale: 'en-US' });

    const { result } = renderHook(() => useMoneyFormat());
    const before = result.current.format(1234.56);

    await act(async () => {
      applyLanguage('sq');
    });

    expect(i18n.language).toBe('sq');
    // The decisive assertion: switching the interface language changed nothing
    // about how money renders.
    expect(result.current.format(1234.56)).toBe(before);
    expect(result.current.format(1234.56)).toBe('$1,234.56');
  });

  it('formats money by tenant locale even when the UI is English', async () => {
    // The mirror case: Albanian formatting under an English interface. Both
    // directions have to hold, or the settings are not actually orthogonal.
    setTenant({ tenantCurrency: 'ALL', tenantLocale: 'sq-AL', userLanguage: 'en' });

    const { result } = renderHook(() => useMoneyFormat());
    const formatted = result.current.format(1234.5);

    expect(i18n.language).toBe('en');
    expect(formatted).toContain('Lekë');
    expect(formatted).toContain('1235');
  });

  it('never reads the tenant locale as a language', () => {
    // 'en-GB' is a formatting locale, not one of our UI languages. If the two
    // were conflated this would leave i18next on an unsupported language.
    setTenant({ tenantLocale: 'en-GB', userLanguage: null, tenantDefaultLanguage: 'sq' });

    expect(resolveLanguage(undefined, 'sq')).toBe('sq');
    expect(resolveLanguage(null, 'en-GB')).toBe(DEFAULT_LANGUAGE);
  });
});

describe('language resolution precedence', () => {
  it('prefers the user override over the workspace default', () => {
    expect(resolveLanguage('sq', 'en')).toBe('sq');
    expect(resolveLanguage('en', 'sq')).toBe('en');
  });

  it('follows the workspace default when the user has expressed no preference', () => {
    // Null is meaningful: it means "follow the company", so a tenant switching
    // its default moves this user too.
    expect(resolveLanguage(null, 'sq')).toBe('sq');
    expect(resolveLanguage(undefined, 'sq')).toBe('sq');
  });

  it('falls back to the default language rather than rendering raw keys', () => {
    expect(resolveLanguage(null, null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('klingon', 'elvish')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('sq-AL', null)).toBe(DEFAULT_LANGUAGE);
  });
});

describe('catalogue integrity', () => {
  it('translates a common key in every shipped language', () => {
    expect(i18n.getFixedT('en', 'common')('actions.save')).toBe('Save');
    expect(i18n.getFixedT('sq', 'common')('actions.save')).toBe('Ruaj');
    expect(i18n.getFixedT('el', 'common')('actions.save')).toBe('Αποθήκευση');
    expect(i18n.getFixedT('it', 'common')('actions.save')).toBe('Salva');
  });

  /*
   * The failure this guards against is silent. i18next falls back to English
   * for any key a language is missing, so an unwired catalogue does not throw
   * or warn — the interface simply stays in English, and the language looks
   * "supported" in the picker while translating nothing.
   *
   * Checking a key per namespace catches the realistic mistake: adding a
   * language to SUPPORTED_LANGUAGES and its catalogue files, then forgetting
   * one import in the resources map.
   */
  it.each(['sq', 'el', 'it'] as const)(
    'has %s wired into resources for every namespace, not just declared',
    (language) => {
      const probes = {
        common: 'actions.save',
        auth: 'login.submit',
        clients: 'list.title',
        appointments: 'calendar.today',
        inventory: 'list.title',
        quotations: 'list.title',
        settings: 'profile.title',
        dashboard: 'recentActivity',
        notifications: 'title',
      } as const;

      for (const [namespace, key] of Object.entries(probes)) {
        const translated = i18n.getFixedT(language, namespace)(key);
        const english = i18n.getFixedT('en', namespace)(key);
        expect(translated).not.toContain(`${namespace}:`);
        expect(translated).not.toBe(english);
      }
    }
  );

  it('names every supported language in its own script', () => {
    // A picker that says "Greek" is no help to someone who only reads Greek.
    for (const language of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS[language]).toBeTruthy();
    }
    expect(LANGUAGE_LABELS.el).toBe('Ελληνικά');
    expect(LANGUAGE_LABELS.it).toBe('Italiano');
  });

  it('falls back to English for a key Albanian has not translated yet', () => {
    // Extraction lands progressively; a missing Albanian key must render usable
    // English, never `common:actions.something`.
    const t = i18n.getFixedT('sq', 'common');
    expect(t('state.loading')).not.toContain('common:');
  });

  it('sets the document language so screen readers and hyphenation follow', () => {
    applyLanguage('sq');
    expect(document.documentElement.lang).toBe('sq');
    applyLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
