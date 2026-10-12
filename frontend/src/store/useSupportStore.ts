import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

/** What the Support session is doing: nothing, a full tour, one control explained, or picking a control. */
export type SupportMode = 'none' | 'tour' | 'single' | 'pick';

export interface SupportContext {
  /** The page the running session belongs to; null when no session runs. */
  pageId: string | null;
  /** Published by pages that have several guides at one URL (the role dashboards). */
  variant: string | null;
  /** Published by pages with tabs: the active tab. */
  scope: string | null;
}

interface SupportState {
  panelOpen: boolean;
  mode: SupportMode;
  context: SupportContext;
  openPanel: () => void;
  closePanel: () => void;
  /** Start a tour for `pageId`. The panel closes so the page is visible. */
  startTour: (pageId: string) => void;
  /** Return to mode `none` without touching what the page published. */
  endSession: () => void;
  setContext: (patch: Partial<Pick<SupportContext, 'variant' | 'scope'>>) => void;
  /** Drop what a page published (on its unmount) so a stale variant cannot leak to the next page. */
  clearContext: () => void;
}

const EMPTY_CONTEXT: SupportContext = { pageId: null, variant: null, scope: null };

/**
 * The Support session's state (panel, mode, page context). Held outside the
 * pages, because each page mounts its own AppLayout: the header opens the
 * panel and the host, mounted once above the pages in TenantGuard, reads it.
 * Not persisted; progress persistence is `progressStorage`.
 */
export const useSupportStore = create<SupportState>((set) => ({
  panelOpen: false,
  mode: 'none',
  context: EMPTY_CONTEXT,
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  startTour: (pageId) => set((state) => ({ panelOpen: false, mode: 'tour', context: { ...state.context, pageId } })),
  endSession: () => set((state) => ({ mode: 'none', context: { ...state.context, pageId: null } })),
  setContext: (patch) => set((state) => ({ context: { ...state.context, ...patch } })),
  clearContext: () => set((state) => ({ context: { ...state.context, variant: null, scope: null } })),
}));

// Signing out ends everything, so the next person to sign in on this browser starts clean.
useAuthStore.subscribe((state, previous) => {
  if (previous.user && !state.user) {
    useSupportStore.setState({ panelOpen: false, mode: 'none', context: EMPTY_CONTEXT });
  }
});
