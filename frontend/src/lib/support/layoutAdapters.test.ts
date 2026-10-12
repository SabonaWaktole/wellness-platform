import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureOpen, isAdapterName, registerAdapter, restoreAll } from './layoutAdapters';

const adapter = (initiallyOpen = false) => {
  const state = { open: initiallyOpen };
  return {
    state,
    adapter: {
      isOpen: () => state.open,
      open: vi.fn(() => void (state.open = true)),
      close: vi.fn(() => void (state.open = false)),
    },
  };
};

beforeEach(() => restoreAll());

describe('SUP-15 layout adapters', () => {
  it('SUP-15 names the two view states a step may need', () => {
    expect(isAdapterName('sidebar')).toBe(true);
    expect(isAdapterName('mobileSearch')).toBe(true);
    expect(isAdapterName('empty')).toBe(false);
  });

  it('SUP-15 reports that nothing is available when no adapter is registered', () => {
    expect(ensureOpen('sidebar')).toBe(false);
  });

  it('SUP-15 opens a closed view and closes it again on restore', () => {
    const { adapter: a, state } = adapter(false);
    const off = registerAdapter('sidebar', a);
    expect(ensureOpen('sidebar')).toBe(true);
    expect(state.open).toBe(true);
    restoreAll();
    expect(state.open).toBe(false);
    expect(a.close).toHaveBeenCalledTimes(1);
    off();
  });

  it('SUP-15 leaves a view alone that was already open, before and after', () => {
    const { adapter: a, state } = adapter(true);
    const off = registerAdapter('sidebar', a);
    ensureOpen('sidebar');
    restoreAll();
    expect(a.open).not.toHaveBeenCalled();
    expect(a.close).not.toHaveBeenCalled();
    expect(state.open).toBe(true);
    off();
  });

  it('SUP-15 remembers the state from before the first request, not after', () => {
    const { adapter: a, state } = adapter(false);
    const off = registerAdapter('sidebar', a);
    ensureOpen('sidebar');
    ensureOpen('sidebar');
    restoreAll();
    expect(state.open).toBe(false);
    off();
  });

  it('SUP-15 restores each view independently', () => {
    const sidebar = adapter(false);
    const search = adapter(true);
    const offs = [registerAdapter('sidebar', sidebar.adapter), registerAdapter('mobileSearch', search.adapter)];
    ensureOpen('sidebar');
    ensureOpen('mobileSearch');
    restoreAll();
    expect(sidebar.state.open).toBe(false);
    expect(search.state.open).toBe(true);
    offs.forEach((off) => off());
  });

  it('SUP-15 restoring twice does nothing the second time', () => {
    const { adapter: a } = adapter(false);
    const off = registerAdapter('sidebar', a);
    ensureOpen('sidebar');
    restoreAll();
    restoreAll();
    expect(a.close).toHaveBeenCalledTimes(1);
    off();
  });

  it('SUP-15 unregistering removes the adapter, and a restore afterwards is safe', () => {
    const { adapter: a } = adapter(false);
    const off = registerAdapter('sidebar', a);
    ensureOpen('sidebar');
    off();
    expect(ensureOpen('sidebar')).toBe(false);
    expect(() => restoreAll()).not.toThrow();
  });

  it('SUP-15 does not close a view the user closed themselves during the step', () => {
    const { adapter: a, state } = adapter(false);
    const off = registerAdapter('sidebar', a);
    ensureOpen('sidebar');
    state.open = false;
    restoreAll();
    expect(a.close).not.toHaveBeenCalled();
    off();
  });
});
