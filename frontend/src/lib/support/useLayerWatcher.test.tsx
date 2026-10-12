import { act, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../components/ui/Modal/Modal';
import { subscriberCount } from './domObserverHub';
import { LAYER_EXIT_GRACE_MS, useLayerWatcher } from './useLayerWatcher';

const created: HTMLElement[] = [];
const addLayer = (id: string) => {
  const node = document.createElement('div');
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('data-tour', id);
  node.setAttribute('data-tour-layer', '');
  document.body.append(node);
  created.push(node);
  return node;
};
const frames = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));

afterEach(() => {
  created.splice(0).forEach((n) => n.remove());
  vi.useRealTimers();
});

describe('SUP-10 useLayerWatcher', () => {
  it('SUP-10 watches nothing without a layer id', () => {
    const before = subscriberCount();
    const { result } = renderHook(() => useLayerWatcher(null, { onOpen: vi.fn(), onClose: vi.fn() }));
    expect(result.current).toBe(false);
    expect(subscriberCount()).toBe(before);
  });

  it('SUP-10 reports a layer that is already open', () => {
    addLayer('a.dialog');
    const onOpen = vi.fn();
    const { result } = renderHook(() => useLayerWatcher('a.dialog', { onOpen, onClose: vi.fn() }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it('SUP-10 reports a layer that opens later, once', async () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useLayerWatcher('a.dialog', { onOpen, onClose: vi.fn() }));
    expect(onOpen).not.toHaveBeenCalled();
    addLayer('a.dialog');
    await frames();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it('SUP-08 holds the layer as open through the exit grace, then reports it closed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const layer = addLayer('a.dialog');
    const onClose = vi.fn();
    const { result } = renderHook(() => useLayerWatcher('a.dialog', { onOpen: vi.fn(), onClose }));
    layer.remove();
    await act(async () => void vi.advanceTimersByTime(50));
    expect(result.current).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(LAYER_EXIT_GRACE_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('SUP-08 a layer that comes straight back (a re-render swap) is not reported closed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const layer = addLayer('a.dialog');
    const onClose = vi.fn();
    renderHook(() => useLayerWatcher('a.dialog', { onOpen: vi.fn(), onClose }));
    layer.remove();
    await act(async () => void vi.advanceTimersByTime(100));
    addLayer('a.dialog');
    await act(async () => void vi.advanceTimersByTime(LAYER_EXIT_GRACE_MS * 2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('SUP-10 reports a second opening after a close', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const onOpen = vi.fn();
    const layer = addLayer('a.dialog');
    renderHook(() => useLayerWatcher('a.dialog', { onOpen, onClose: vi.fn() }));
    layer.remove();
    await act(async () => void vi.advanceTimersByTime(LAYER_EXIT_GRACE_MS + 50));
    addLayer('a.dialog');
    await act(async () => void vi.advanceTimersByTime(50));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('SUP-06 unsubscribes on unmount', () => {
    const before = subscriberCount();
    const { unmount } = renderHook(() => useLayerWatcher('a.dialog', { onOpen: vi.fn(), onClose: vi.fn() }));
    expect(subscriberCount()).toBe(before + 1);
    unmount();
    expect(subscriberCount()).toBe(before);
  });

  it('SUP-08 works with the real Modal, whose exit animation keeps it in the page for a moment', async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const Probe = () => {
      const [open, setOpen] = useState(true);
      useLayerWatcher('fx.dialog', { onOpen, onClose });
      return (
        <>
          <button type="button" aria-label="close it" onClick={() => setOpen(false)} />
          <Modal isOpen={open} onClose={() => setOpen(false)} title="Fixture" tourId="fx.dialog">
            <p>{'Body'}</p>
          </Modal>
        </>
      );
    };
    render(<Probe />);
    await frames();
    expect(onOpen).toHaveBeenCalledTimes(1);
    act(() => screen.getByRole('button', { name: 'close it' }).click());
    await act(async () => void (await new Promise((r) => setTimeout(r, LAYER_EXIT_GRACE_MS + 900))));
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 10000);
});
