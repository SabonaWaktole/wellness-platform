import type { i18n as I18n } from 'i18next';
import i18n from '../../i18n';
import { SOURCE_LANGUAGE, type Namespace } from '../../i18n/config';

/**
 * Loads Support copy (`locales/<lng>/support*.json`) only when Support needs
 * it. Every other locale file is imported statically into the main bundle;
 * the copy for ~60 pages must not join it, so `i18n/index.ts` never imports
 * these files and nothing outside this module may either.
 *
 * Loading adds the active language and English (the fallback). A language
 * switch loads the new language for every namespace asked for so far, so text
 * follows the language without restarting the tour. Callers that must show
 * text on the next render await `loadSupportCopy`.
 */

type Modules = Record<string, () => Promise<unknown>>;

export function createSupportCopy(instance: I18n, modules: Modules) {
  const requested = new Set<Namespace>();
  const loaded = new Set<string>();
  let listening = false;

  async function loadOne(lng: string, ns: string): Promise<void> {
    const key = `${lng}/${ns}`;
    const load = modules[`../../locales/${lng}/${ns}.json`];
    if (loaded.has(key) || !load) return;
    try {
      instance.addResourceBundle(lng, ns, await load(), true, true);
      loaded.add(key);
    } catch (error) {
      // A missing chunk degrades to English (or the key); it must not break the page.
      console.warn(`Support copy ${key} could not be loaded`, error);
    }
  }

  const loadFor = (lng: string, ns: Namespace) =>
    Promise.all([...new Set([lng, SOURCE_LANGUAGE])].map((language) => loadOne(language, ns))).then(() => undefined);

  async function loadSupportCopy(ns: Namespace): Promise<void> {
    requested.add(ns);
    if (!listening) {
      listening = true;
      instance.on('languageChanged', (lng: string) => {
        for (const name of requested) void loadFor(lng, name);
      });
    }
    await loadFor(instance.language, ns);
  }

  return { loadSupportCopy };
}

export const { loadSupportCopy } = createSupportCopy(
  i18n,
  import.meta.glob('../../locales/*/support*.json', { import: 'default' }),
);
