import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import i18next, { type i18n } from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSupportCopy } from './supportCopy';

const settle = () => new Promise((r) => setTimeout(r, 0));

const makeI18n = async (lng: string): Promise<i18n> => {
  const instance = i18next.createInstance();
  await instance.init({ lng, fallbackLng: 'en', ns: ['common'], defaultNS: 'common', resources: {}, initImmediate: false });
  return instance;
};

/** Stand ins for the lazily globbed `locales/<lng>/support*.json` files. */
const fakeModules = (loaded: string[] = []) => {
  const file = (lng: string, ns: string, text: string) => [
    `../../locales/${lng}/${ns}.json`,
    async () => {
      loaded.push(`${lng}/${ns}`);
      return { tour: { title: text } };
    },
  ] as const;
  return Object.fromEntries([file('en', 'support', 'English'), file('sq', 'support', 'Shqip'), file('en', 'supportSales', 'English sales')]);
};

describe('SUP-18 SUP-19 support copy is loaded on demand', () => {
  let i18n: i18n;
  beforeEach(async () => {
    i18n = await makeI18n('sq');
  });

  it('SUP-19 the copy is not in the i18n store until it is asked for', async () => {
    expect(i18n.hasResourceBundle('en', 'support')).toBe(false);
    expect(i18n.hasResourceBundle('sq', 'support')).toBe(false);
    await createSupportCopy(i18n, fakeModules()).loadSupportCopy('support');
    expect(i18n.hasResourceBundle('sq', 'support')).toBe(true);
    expect(i18n.t('support:tour.title')).toBe('Shqip');
  });

  it('SUP-18 English is always loaded as the fallback', async () => {
    await createSupportCopy(i18n, fakeModules()).loadSupportCopy('support');
    expect(i18n.hasResourceBundle('en', 'support')).toBe(true);
  });

  it('SUP-18 a language with no file falls back to the English text', async () => {
    const greek = await makeI18n('el');
    await createSupportCopy(greek, fakeModules()).loadSupportCopy('support');
    expect(greek.t('support:tour.title')).toBe('English');
  });

  it('SUP-19 loads only the namespace asked for, and each file once', async () => {
    const loaded: string[] = [];
    const copy = createSupportCopy(i18n, fakeModules(loaded));
    await copy.loadSupportCopy('support');
    await copy.loadSupportCopy('support');
    expect(loaded.sort()).toEqual(['en/support', 'sq/support']);
    expect(i18n.hasResourceBundle('en', 'supportSales')).toBe(false);
  });

  it('SUP-18 a namespace with no files at all resolves quietly', async () => {
    await expect(createSupportCopy(i18n, {}).loadSupportCopy('supportAdmin')).resolves.toBeUndefined();
  });

  it('SUP-18 a language switch loads the new language without being asked again', async () => {
    await createSupportCopy(i18n, fakeModules()).loadSupportCopy('support');
    expect(i18n.hasResourceBundle('it', 'support')).toBe(false);
    await i18n.changeLanguage('en');
    await settle();
    expect(i18n.t('support:tour.title')).toBe('English');
  });

  it('SUP-18 a switch loads every namespace that was requested', async () => {
    const copy = createSupportCopy(i18n, {
      ...fakeModules(),
      '../../locales/sq/supportSales.json': async () => ({ tour: { title: 'Shitje' } }),
    });
    await copy.loadSupportCopy('support');
    await copy.loadSupportCopy('supportSales');
    await i18n.changeLanguage('en');
    await i18n.changeLanguage('sq');
    await settle();
    expect(i18n.t('supportSales:tour.title')).toBe('Shitje');
  });

  it('SUP-19 a file that fails to load does not reject, and English still works', async () => {
    const copy = createSupportCopy(i18n, {
      '../../locales/en/support.json': async () => ({ tour: { title: 'English' } }),
      '../../locales/sq/support.json': async () => {
        throw new Error('chunk failed');
      },
    });
    await expect(copy.loadSupportCopy('support')).resolves.toBeUndefined();
    expect(i18n.t('support:tour.title')).toBe('English');
  });
});

describe('SUP-18 SUP-19 support copy never joins the main bundle', () => {
  const src = resolve(__dirname, '..', '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it('SUP-19 no module imports a support*.json file statically', () => {
    const offenders = walk(src)
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('supportCopy.ts') && !file.endsWith('supportCopy.test.ts'))
      .filter((file) => /\bfrom\s+['"][^'"]*locales\/[^'"]*support[^'"]*\.json['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('SUP-19 supportCopy globs lazily, not eagerly', () => {
    const source = readFileSync(resolve(__dirname, 'supportCopy.ts'), 'utf8');
    expect(source).toContain("import.meta.glob");
    expect(source).not.toMatch(/eager:\s*true/);
  });

  it('SUP-19 the main i18n module does not mention support copy', () => {
    expect(readFileSync(resolve(src, 'i18n', 'index.ts'), 'utf8')).not.toMatch(/support/i);
  });
});
