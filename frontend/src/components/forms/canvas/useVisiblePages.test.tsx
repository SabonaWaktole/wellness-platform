import React from 'react';
import { render, act } from '@testing-library/react';
import { useVisiblePages } from './useVisiblePages';

/** Captures the callback so a test can fire intersection entries by hand —
 *  jsdom has no real layout, so nothing would ever intersect on its own. */
class ControllableIntersectionObserver {
  static instances: ControllableIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    ControllableIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(entries: { target: Element; isIntersecting: boolean }[]): void {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

/** Mounts real DOM nodes wired through the hook's own `setPageRef`, so ref
 *  callbacks run in the same commit as the effect that observes them —
 *  exactly the ordering FormCanvas relies on. */
const Harness: React.FC<{ pageIds: string[]; onResult: (r: ReturnType<typeof useVisiblePages>) => void }> = ({
  pageIds,
  onResult,
}) => {
  const result = useVisiblePages(pageIds);
  onResult(result);
  return (
    <>
      {pageIds.map((id) => (
        <div key={id} data-page-id={id} ref={result.setPageRef(id)} />
      ))}
    </>
  );
};

describe('useVisiblePages', () => {
  let originalIO: typeof IntersectionObserver;

  beforeEach(() => {
    ControllableIntersectionObserver.instances = [];
    originalIO = (globalThis as any).IntersectionObserver;
    (globalThis as any).IntersectionObserver = ControllableIntersectionObserver;
  });

  afterEach(() => {
    (globalThis as any).IntersectionObserver = originalIO;
  });

  it('starts with every page visible, before the observer reports anything', () => {
    let latest: ReturnType<typeof useVisiblePages>;
    render(<Harness pageIds={['p1', 'p2', 'p3', 'p4']} onResult={(r) => (latest = r)} />);

    expect(latest!.isVisible('p1')).toBe(true);
    expect(latest!.isVisible('p2')).toBe(true);
    expect(latest!.isVisible('p3')).toBe(true);
    expect(latest!.isVisible('p4')).toBe(true);
  });

  it('marks a page visible once the observer reports it intersecting', () => {
    let latest: ReturnType<typeof useVisiblePages>;
    render(<Harness pageIds={['p1', 'p2', 'p3']} onResult={(r) => (latest = r)} />);

    const observer = ControllableIntersectionObserver.instances[ControllableIntersectionObserver.instances.length - 1];
    const target = observer.observed.find((el) => (el as HTMLElement).dataset.pageId === 'p3')!;
    act(() => observer.fire([{ target, isIntersecting: true }]));

    expect(latest!.isVisible('p3')).toBe(true);
  });

  it('unmarks a page once it scrolls back out of range', () => {
    let latest: ReturnType<typeof useVisiblePages>;
    render(<Harness pageIds={['p1', 'p2']} onResult={(r) => (latest = r)} />);

    const observer = ControllableIntersectionObserver.instances[ControllableIntersectionObserver.instances.length - 1];
    const target = observer.observed.find((el) => (el as HTMLElement).dataset.pageId === 'p1')!;
    act(() => observer.fire([{ target, isIntersecting: false }]));

    expect(latest!.isVisible('p1')).toBe(false);
  });

  it('defaults a page added after mount to visible too', () => {
    let latest: ReturnType<typeof useVisiblePages>;
    const { rerender } = render(<Harness pageIds={['p1']} onResult={(r) => (latest = r)} />);
    expect(latest!.isVisible('p2')).toBe(false);

    rerender(<Harness pageIds={['p1', 'p2']} onResult={(r) => (latest = r)} />);
    expect(latest!.isVisible('p2')).toBe(true);
  });

  it('observes every page passed in', () => {
    let latest: ReturnType<typeof useVisiblePages>;
    render(<Harness pageIds={['p1', 'p2', 'p3']} onResult={(r) => (latest = r)} />);

    const observer = ControllableIntersectionObserver.instances[ControllableIntersectionObserver.instances.length - 1];
    expect(observer.observed.map((el) => (el as HTMLElement).dataset.pageId).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});
