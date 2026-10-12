import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeToDom, subscriberCount } from './domObserverHub';

const frames = async (n: number) => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SUP-06 DOM observer hub', () => {
  it('SUP-06 creates no observer until the first subscription', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    expect(subscriberCount()).toBe(0);
    expect(observe).not.toHaveBeenCalled();
  });

  it('SUP-06 observes once for many subscribers and disconnects after the last leaves', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const a = subscribeToDom(() => {});
    const b = subscribeToDom(() => {});
    expect(observe).toHaveBeenCalledTimes(1);
    expect(subscriberCount()).toBe(2);
    a();
    expect(disconnect).not.toHaveBeenCalled();
    b();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(subscriberCount()).toBe(0);
  });

  it('SUP-06 batches many mutations into one notification per frame', async () => {
    const cb = vi.fn();
    const off = subscribeToDom(cb);
    for (let i = 0; i < 20; i += 1) document.body.append(document.createElement('div'));
    await frames(3);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('SUP-06 reports a change to an observed attribute', async () => {
    const node = document.createElement('button');
    document.body.append(node);
    const cb = vi.fn();
    const off = subscribeToDom(cb);
    node.setAttribute('disabled', '');
    await frames(3);
    expect(cb).toHaveBeenCalled();
    off();
  });

  it('SUP-06 ignores attributes outside the filter', async () => {
    const node = document.createElement('button');
    document.body.append(node);
    const cb = vi.fn();
    const off = subscribeToDom(cb);
    node.setAttribute('title', 'x');
    await frames(3);
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('SUP-06 stops notifying a subscriber that left', async () => {
    const cb = vi.fn();
    const keep = subscribeToDom(() => {});
    subscribeToDom(cb)();
    document.body.append(document.createElement('div'));
    await frames(3);
    expect(cb).not.toHaveBeenCalled();
    keep();
  });
});
