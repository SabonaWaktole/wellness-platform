import { create } from 'zustand';

/** How long a message stays in the live region before it is cleared and the region may unmount. */
export const ANNOUNCEMENT_LIFETIME_MS = 4000;

interface AnnouncerState {
  message: string;
  /** Bumps on every message actually announced; an identical consecutive one does not bump it. */
  sequence: number;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  message: '',
  sequence: 0,
  clear: () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    set({ message: '' });
  },
}));

/** Says something through the Support live region. Empty and identical consecutive messages are ignored. */
export function announce(message: string): void {
  if (!message || message === useAnnouncerStore.getState().message) return;
  if (timer !== null) clearTimeout(timer);
  useAnnouncerStore.setState((state) => ({ message, sequence: state.sequence + 1 }));
  timer = setTimeout(() => useAnnouncerStore.getState().clear(), ANNOUNCEMENT_LIFETIME_MS);
}
