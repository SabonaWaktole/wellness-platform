import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockRect, ON_SCREEN } from '../../mocks/mockRect';
import { useTargetRect } from './useTargetRect';

const frame = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));

const target = () => {
  const node = document.createElement('button');
  document.body.append(node);
  return mockRect(node);
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SUP-15 useTargetRect', () => {
  it('SUP-15 returns null without an element', () => {
    expect(renderHook(() => useTargetRect(null)).result.current).toBeNull();
  });

  it('SUP-15 returns the element rect grown by the padding on every side', () => {
    const node = target();
    const { result } = renderHook(() => useTargetRect(node, 4));
    expect(result.current).toEqual({
      top: ON_SCREEN.top - 4,
      left: ON_SCREEN.left - 4,
      width: ON_SCREEN.width + 8,
      height: ON_SCREEN.height + 8,
    });
  });

  it('SUP-15 re-measures on window resize', async () => {
    const node = target();
    const { result } = renderHook(() => useTargetRect(node, 0));
    mockRect(node, { top: 10, left: 20, width: 30, height: 40 });
    window.dispatchEvent(new Event('resize'));
    await frame();
    expect(result.current).toEqual({ top: 10, left: 20, width: 30, height: 40 });
  });

  it('SUP-15 re-measures on a scroll of any ancestor (capture phase)', async () => {
    const node = target();
    const { result } = renderHook(() => useTargetRect(node, 0));
    mockRect(node, { top: 55, left: 20, width: 30, height: 40 });
    const scroller = document.createElement('div');
    document.body.append(scroller);
    scroller.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    await frame();
    expect(result.current?.top).toBe(55);
  });

  it('SUP-15 coalesces a burst of events into one measurement per frame', async () => {
    const node = target();
    const measure = vi.spyOn(node, 'getBoundingClientRect');
    renderHook(() => useTargetRect(node, 0));
    measure.mockClear();
    for (let i = 0; i < 10; i += 1) window.dispatchEvent(new Event('resize'));
    await frame();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('SUP-15 re-measures when the element itself is resized', () => {
    const node = target();
    const callbacks: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { callbacks.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const { result } = renderHook(() => useTargetRect(node, 0));
    mockRect(node, { top: 1, left: 2, width: 99, height: 98 });
    act(() => callbacks.forEach((cb) => cb()));
    return frame().then(() => expect(result.current).toMatchObject({ width: 99, height: 98 }));
  });

  it('SUP-15 binds to a replacement element', () => {
    const first = target();
    const { result, rerender } = renderHook(({ el }) => useTargetRect(el, 0), { initialProps: { el: first as Element | null } });
    const second = mockRect(document.createElement('button'), { top: 7, left: 8, width: 9, height: 10 });
    rerender({ el: second });
    expect(result.current).toEqual({ top: 7, left: 8, width: 9, height: 10 });
  });

  it('SUP-15 removes its window listeners on unmount', () => {
    const node = target();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useTargetRect(node, 0));
    const added = add.mock.calls.filter(([type]) => type === 'resize' || type === 'scroll').length;
    unmount();
    const removed = remove.mock.calls.filter(([type]) => type === 'resize' || type === 'scroll').length;
    expect(added).toBe(2);
    expect(removed).toBe(2);
  });
});
