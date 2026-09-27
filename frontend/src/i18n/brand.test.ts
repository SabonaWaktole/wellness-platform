import { describe, it, expect } from 'vitest';
import i18n, { resources } from './index';
import { SUPPORTED_LANGUAGES } from './config';

/** Every string in every catalogue, keyed `language:namespace:path`. */
function allStrings(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') out.push([path, value]);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  for (const [language, namespaces] of Object.entries(resources)) {
    for (const [namespace, catalogue] of Object.entries(namespaces)) {
      walk(catalogue, `${language}:${namespace}`);
    }
  }
  return out;
}

describe('product name in the catalogues', () => {
  it('FR-BR-04 names Neva nowhere, in any language', () => {
    // The CI grep covers source files; this covers the rendered text, and runs
    // with every other test instead of only in CI.
    const offenders = allStrings().filter(([, text]) => /neva/i.test(text));
    expect(offenders).toEqual([]);
  });

  it.each(SUPPORTED_LANGUAGES)('FR-BR-04 names Wellness Albania on the sign-in page in %s', (language) => {
    const subtitle = i18n.getFixedT(language, 'auth')('login.subtitle');
    expect(subtitle).toContain('Wellness Albania');
  });
});
