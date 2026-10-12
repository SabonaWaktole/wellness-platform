import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockRect } from '../../mocks/mockRect';
import { subscriberCount } from './domObserverHub';
import { useTargetElement } from './useTargetElement';

/** Two frames: the mutation observer fires, then the hub batches into the next animation frame. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 2; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

const makeMain = () => {
  const main = document.createElement('main');
  document.body.append(main);
  return main;
};

const button = (token: string, extra: Record<string, string> = {}) => {
  const node = document.createElement('button');
  node.setAttribute('data-tour', token);
  Object.entries(extra).forEach(([key, value]) => node.setAttribute(key, value));
  return mockRect(node);
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SUP-06 useTargetElement: the element changes under the tour', () => {
  it('SUP-06 follows a target through missing, found, lost, found, disabled', async () => {
    const main = makeMain();
    const { result } = renderHook(() => useTargetElement({ id: 'page.add' }));
    expect(result.current.status).toBe('missing');

    const first = button('page.add');
    main.append(first);
    await settle();
    expect(result.current).toMatchObject({ element: first, status: 'found' });

    first.remove();
    await settle();
    expect(result.current).toMatchObject({ element: null, status: 'lost' });

    const second = button('page.add');
    main.append(second);
    await settle();
    expect(result.current).toMatchObject({ element: second, status: 'found' });

    second.setAttribute('disabled', '');
    await settle();
    expect(result.current).toMatchObject({ element: second, status: 'disabled' });
  });

  it('SUP-08 an element replaced by another with the same token is picked up by identity', async () => {
    const main = makeMain();
    const first = button('page.add');
    main.append(first);
    const { result } = renderHook(() => useTargetElement({ id: 'page.add' }));
    expect(result.current.element).toBe(first);

    const second = button('page.add');
    first.replaceWith(second);
    await settle();
    expect(result.current).toMatchObject({ element: second, status: 'found' });
  });

  it('SUP-06 reports the measured rect of the element', () => {
    const main = makeMain();
    main.append(mockRect(button('page.add'), { top: 7, left: 9, width: 50, height: 20 }));
    const { result } = renderHook(() => useTargetElement({ id: 'page.add' }));
    expect(result.current.rect).toMatchObject({ top: 7, left: 9, width: 50, height: 20 });
  });

  it('SUP-06 updates the rect when the element is resized', async () => {
    const main = makeMain();
    const node = button('page.add');
    main.append(node);
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { result } = renderHook(() => useTargetElement({ id: 'page.add' }));
    mockRect(node, { top: 1, left: 2, width: 300, height: 40 });
    act(() => callbacks.forEach((cb) => cb()));
    expect(result.current.rect).toMatchObject({ width: 300, height: 40 });
    vi.unstubAllGlobals();
  });
});

describe('SUP-07 useTargetElement: repeated targets', () => {
  it('SUP-07 moves to the second row when the first is removed, without a new subscription', async () => {
    const main = makeMain();
    const rows = [button('page.row'), button('page.row'), button('page.row')];
    main.append(...rows);
    const { result } = renderHook(() => useTargetElement({ id: 'page.row', repeat: true }));
    expect(result.current.element).toBe(rows[0]);
    const subscribed = subscriberCount();

    rows[0].remove();
    await settle();
    expect(result.current.element).toBe(rows[1]);
    expect(subscriberCount()).toBe(subscribed);
  });
});

describe('SUP-08 useTargetElement: waiting and duplicates', () => {
  it('SUP-08 stays pending under a busy region, then becomes missing after the wait', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const main = makeMain();
    const busy = document.createElement('section');
    busy.setAttribute('aria-busy', 'true');
    main.append(busy);

    const { result } = renderHook(() => useTargetElement({ id: 'page.add' }, { waitMs: 4000 }));
    expect(result.current.status).toBe('pending');

    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(result.current.status).toBe('pending');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.status).toBe('missing');
  });

  it('SUP-08 warns exactly once when a non-repeat id sits on two visible elements', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const main = makeMain();
    main.append(button('page.add'), button('page.add'));
    const { rerender } = renderHook(() => useTargetElement({ id: 'page.add' }));
    await settle();
    rerender();
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('page.add');
  });

  it('SUP-07 does not warn for an id declared repeat', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const main = makeMain();
    main.append(button('page.row'), button('page.row'));
    renderHook(() => useTargetElement({ id: 'page.row', repeat: true }));
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('SUP-06 useTargetElement: lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('SUP-06 unsubscribes from the hub on unmount', () => {
    makeMain();
    const before = subscriberCount();
    const { unmount } = renderHook(() => useTargetElement({ id: 'page.add' }));
    expect(subscriberCount()).toBe(before + 1);
    unmount();
    expect(subscriberCount()).toBe(before);
  });

  it('SUP-06 a null spec subscribes to nothing', () => {
    const before = subscriberCount();
    const { result } = renderHook(() => useTargetElement(null));
    expect(result.current).toMatchObject({ element: null, status: 'missing' });
    expect(subscriberCount()).toBe(before);
  });

  it('SUP-06 switching to another spec re-resolves', () => {
    const main = makeMain();
    const a = button('page.a');
    const b = button('page.b');
    main.append(a, b);
    const { result, rerender } = renderHook(({ id }) => useTargetElement({ id }), { initialProps: { id: 'page.a' } });
    expect(result.current.element).toBe(a);
    rerender({ id: 'page.b' });
    expect(result.current.element).toBe(b);
  });
});
