import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollTargetIntoView } from './scrollTargetIntoView';

const created: HTMLElement[] = [];
const make = (tag: string) => {
  const node = document.createElement(tag);
  document.body.append(node);
  created.push(node);
  return node;
};

afterEach(() => {
  created.splice(0).forEach((n) => n.remove());
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const stubScroll = () => {
  const seen: Array<{ options: ScrollIntoViewOptions; top: string; bottom: string }> = [];
  Element.prototype.scrollIntoView = function (this: HTMLElement, options?: boolean | ScrollIntoViewOptions) {
    seen.push({ options: options as ScrollIntoViewOptions, top: this.style.scrollMarginTop, bottom: this.style.scrollMarginBottom });
  };
  return seen;
};

const stubReducedMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') ? reduce : false, media: query, addEventListener() {}, removeEventListener() {} }));

describe('SUP-16 scrollTargetIntoView', () => {
  it('SUP-16 scrolls the nearest scroller just enough, smoothly', () => {
    const seen = stubScroll();
    scrollTargetIntoView(make('button'));
    expect(seen[0].options).toMatchObject({ block: 'nearest', behavior: 'smooth' });
  });

  it('SUP-16 jumps instead of gliding for reduced motion', () => {
    const seen = stubScroll();
    stubReducedMotion(true);
    scrollTargetIntoView(make('button'));
    expect(seen[0].options.behavior).toBe('auto');
  });

  it('SUP-16 leaves room for the sticky header while scrolling', () => {
    const seen = stubScroll();
    const header = make('header');
    header.getBoundingClientRect = () => ({ height: 64 }) as DOMRect;
    scrollTargetIntoView(make('button'));
    expect(seen[0].top).toBe('72px');
  });

  it('SUP-16 leaves room for the mobile sheet at the bottom', () => {
    const seen = stubScroll();
    scrollTargetIntoView(make('button'), { sheetHeight: 200 });
    expect(seen[0].bottom).toBe('208px');
  });

  it('SUP-16 restores the element’s own scroll margins afterwards', () => {
    stubScroll();
    const node = make('button');
    node.style.scrollMarginTop = '3px';
    scrollTargetIntoView(node, { sheetHeight: 50 });
    expect(node.style.scrollMarginTop).toBe('3px');
    expect(node.style.scrollMarginBottom).toBe('');
  });

  it('SUP-16 does nothing where scrollIntoView does not exist', () => {
    expect(() => scrollTargetIntoView(make('button'))).not.toThrow();
  });
});
