import { describe, expect, it } from 'vitest';

/**
 * NFR-I18N-01 / FR-LNG-02: every string goes through i18next, and Albanian —
 * the default language — has every key English has. The same rule is the
 * `npm run check:translations` CI gate; this keeps it inside the test suite,
 * where the requirement's traceability check can see it.
 */
type Catalogue = Record<string, unknown>;

const files = import.meta.glob<Catalogue>('./*/*.json', { eager: true, import: 'default' });

function keysOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Catalogue).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

const namespaces = (language: string) =>
  Object.keys(files)
    .filter((path) => path.startsWith(`./${language}/`))
    .map((path) => path.slice(`./${language}/`.length));

describe('translation catalogues (NFR-I18N-01)', () => {
  it('NFR-I18N-01 Albanian has every namespace English has', () => {
    expect(namespaces('sq').sort()).toEqual(namespaces('en').sort());
  });

  it.each(namespaces('en'))('NFR-I18N-01 sq and en define the same keys in %s', (namespace) => {
    const en = keysOf(files[`./en/${namespace}`]).sort();
    const sq = keysOf(files[`./sq/${namespace}`]).sort();
    expect(sq.filter((key) => !en.includes(key)), 'keys only Albanian has (orphans)').toEqual([]);
    expect(en.filter((key) => !sq.includes(key)), 'keys Albanian is missing').toEqual([]);
  });

  it('NFR-I18N-01 no Albanian string is left empty', () => {
    const empty = namespaces('sq').flatMap((namespace) => {
      const catalogue = files[`./sq/${namespace}`];
      return keysOf(catalogue).filter((key) => {
        const value = key.split('.').reduce<unknown>((node, part) => (node as Catalogue)?.[part], catalogue);
        return typeof value === 'string' && value.trim() === '';
      }).map((key) => `${namespace}: ${key}`);
    });
    expect(empty).toEqual([]);
  });
});
