import { describe, it, expect } from 'vitest';
import i18n from './index';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';
import { resolveLanguage } from './useLanguage';

describe('default interface language', () => {
  it('FR-LNG-01 starts the interface in Albanian before anyone has signed in', () => {
    // Read from the init options rather than `i18n.language`: setupTests moves
    // the test run to English after initialisation, and that must not hide
    // what production starts in.
    expect(i18n.options.lng).toBe('sq');
    expect(DEFAULT_LANGUAGE).toBe('sq');
  });

  it('FR-LNG-01 shows Albanian to a user with no preference in a workspace with none', () => {
    expect(resolveLanguage(null, null)).toBe('sq');
    // An unusable stored value degrades to the default, not to English.
    expect(resolveLanguage(undefined, 'not-a-language')).toBe('sq');
  });

  it('FR-LNG-01 still honours a user who switched to English', () => {
    expect(resolveLanguage('en', 'sq')).toBe('en');
  });

  it('FR-LNG-01 offers Albanian first and English second, and keeps Greek and Italian', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['sq', 'en', 'el', 'it']);
  });
});
