import { describe, it, expect } from 'vitest';
import i18n from './index';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';
import { resolveLanguage } from './useLanguage';

describe('default interface language', () => {
  it('FR-LNG-01 starts the interface in English before anyone has signed in', () => {
    // Read from the init options rather than `i18n.language`: setupTests moves
    // the test run to English after initialisation, and that must not hide
    // what production starts in.
    expect(i18n.options.lng).toBe('en');
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('FR-LNG-01 shows English to a user with no preference in a workspace with none', () => {
    expect(resolveLanguage(null, null)).toBe('en');
    // An unusable stored value degrades to the default, not to another language.
    expect(resolveLanguage(undefined, 'not-a-language')).toBe('en');
  });

  it('FR-LNG-01 still honours a user who switched to Albanian', () => {
    expect(resolveLanguage('sq', 'en')).toBe('sq');
  });

  it('FR-LNG-01 offers English first and Albanian second, and keeps Greek and Italian', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'sq', 'el', 'it']);
  });
});
