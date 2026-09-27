import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with the inline boot script in index.html — keep both in sync. */
export const THEME_STORAGE_KEY = 'wellness-theme';

const prefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (preference: ThemePreference): ResolvedTheme =>
  preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference;

/** Applies the resolved theme to <html>, which is what tokens.css keys off. */
const applyTheme = (resolved: ResolvedTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  // Lets the browser theme native controls (scrollbars, form widgets) to match.
  document.documentElement.style.colorScheme = resolved;
};

const readStoredPreference = (): ThemePreference => {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

interface ThemeState {
  /** What the user chose, including "follow the OS". */
  preference: ThemePreference;
  /** The theme actually being displayed. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light -> dark -> system, for a single-button toggle. */
  cyclePreference: () => void;
  /** Re-resolves when the OS preference changes; only affects "system". */
  syncWithSystem: () => void;
}

const initialPreference = readStoredPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference);
    applyTheme(resolved);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
    set({ preference, resolved });
  },

  cyclePreference: () => {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(get().preference) + 1) % order.length];
    get().setPreference(next);
  },

  syncWithSystem: () => {
    if (get().preference !== 'system') return;
    const resolved = resolveTheme('system');
    applyTheme(resolved);
    set({ resolved });
  },
}));

/**
 * Subscribes the store to OS theme changes. Call once at app startup.
 * Returns an unsubscribe function.
 */
export const initThemeListener = (): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  // Apply immediately so the store and the DOM agree on first paint.
  applyTheme(useThemeStore.getState().resolved);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => useThemeStore.getState().syncWithSystem();
  mediaQuery.addEventListener('change', handleChange);

  return () => mediaQuery.removeEventListener('change', handleChange);
};
