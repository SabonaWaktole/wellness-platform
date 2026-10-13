import { create } from 'zustand';
import { isSupportedLanguage, type Language } from '../i18n/config';

export const VISITOR_LANGUAGE_STORAGE_KEY = 'wellness-visitor-language';

/** Storage can be unavailable (private windows, blocked site data); the choice then lasts the visit. */
const readStored = (): Language | null => {
  try {
    const stored = localStorage.getItem(VISITOR_LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
};

interface VisitorLanguageState {
  /** The language chosen on a signed-out screen, or `null` for the default (English). */
  language: Language | null;
  setLanguage: (language: Language) => void;
}

/**
 * The language someone picked before signing in, remembered in this browser
 * (FR-LNG-01). It only applies while no one is signed in: once signed in, the
 * user's own preference and then the workspace default decide.
 */
export const useVisitorLanguageStore = create<VisitorLanguageState>((set) => ({
  language: readStored(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(VISITOR_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Not remembered, but still applied for this visit.
    }
    set({ language });
  },
}));
