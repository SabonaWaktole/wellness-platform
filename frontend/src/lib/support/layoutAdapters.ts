/**
 * View state the tour may need to change to show a control: the phone sidebar
 * is off screen until it is opened, so a step about the navigation must open
 * it and put it back. Adapters change view state only; they never click.
 */

export type AdapterName = 'sidebar' | 'mobileSearch';

export interface LayoutAdapter {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
}

const adapters = new Map<AdapterName, LayoutAdapter>();
/** For each view the tour opened: whether it was already open before the first request. */
const before = new Map<AdapterName, boolean>();

export const isAdapterName = (value: string): value is AdapterName => value === 'sidebar' || value === 'mobileSearch';

/** Registers (or replaces) an adapter. Returns the function that removes it. */
export function registerAdapter(name: AdapterName, adapter: LayoutAdapter): () => void {
  adapters.set(name, adapter);
  return () => {
    if (adapters.get(name) === adapter) adapters.delete(name);
  };
}

/** Opens the view if it is closed, remembering how it was found. False when no such view is mounted. */
export function ensureOpen(name: AdapterName): boolean {
  const adapter = adapters.get(name);
  if (!adapter) return false;
  if (!before.has(name)) before.set(name, adapter.isOpen());
  if (!adapter.isOpen()) adapter.open();
  return true;
}

/** Puts back every view the tour opened, unless it was open to begin with or the user has closed it since. */
export function restoreAll(): void {
  for (const [name, wasOpen] of before) {
    const adapter = adapters.get(name);
    if (adapter && !wasOpen && adapter.isOpen()) adapter.close();
  }
  before.clear();
}
