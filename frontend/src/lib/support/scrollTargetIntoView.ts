/** Breathing room kept between the target and whatever else is on screen. */
const MARGIN = 8;

/**
 * Brings the tour's target into view in whichever container scrolls it, only as
 * far as needed, leaving room for the sticky header above and, on a phone, the
 * bottom sheet below (`sheetHeight`). Jumps instead of gliding for people who
 * asked for reduced motion.
 */
export function scrollTargetIntoView(element: Element, { sheetHeight = 0 }: { sheetHeight?: number } = {}): void {
  if (typeof element.scrollIntoView !== 'function') return;

  const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll margins are what `scrollIntoView` measures "in view" against; set them for the call only.
  const style = element instanceof HTMLElement ? element.style : null;
  const previous = style ? { top: style.scrollMarginTop, bottom: style.scrollMarginBottom } : null;
  if (style) {
    style.scrollMarginTop = `${header + MARGIN}px`;
    style.scrollMarginBottom = `${sheetHeight + MARGIN}px`;
  }
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (style && previous) {
    style.scrollMarginTop = previous.top;
    style.scrollMarginBottom = previous.bottom;
  }
}
