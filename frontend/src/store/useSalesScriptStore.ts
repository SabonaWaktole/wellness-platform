import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

interface SalesScriptPanelState {
  /** Whether the sales script panel is open. It stays open across pages until closed (FR-SCR-02). */
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * The sales script panel's open state (M2 Slice 5). Held outside the pages,
 * because each page mounts its own AppLayout: the header button toggles it,
 * and the panel, mounted once above the pages in TenantGuard, reads it.
 */
export const useSalesScriptStore = create<SalesScriptPanelState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

// Signing out closes it, so the next person to sign in on this browser starts closed.
useAuthStore.subscribe((state, previous) => {
  if (previous.user && !state.user) useSalesScriptStore.setState({ isOpen: false });
});
