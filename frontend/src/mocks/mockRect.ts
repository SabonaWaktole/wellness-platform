/**
 * jsdom has no layout engine, so every element reports a 0x0 rect. Support's
 * resolver treats an unmeasurable element as not shown, so a test gives each
 * element it wants "on screen" a rect with this helper. Real geometry is
 * verified in Playwright.
 */
export interface TestRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const ON_SCREEN: TestRect = { top: 100, left: 100, width: 120, height: 32 };

export const makeDomRect = ({ top, left, width, height }: TestRect): DOMRect =>
  ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

export function mockRect<T extends Element>(element: T, rect: TestRect = ON_SCREEN): T {
  element.getBoundingClientRect = () => makeDomRect(rect);
  return element;
}
