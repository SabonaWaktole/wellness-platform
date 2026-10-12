import { useLayoutEffect, useState } from 'react';
import { subscribeToDom } from './domObserverHub';
import type { TargetRect } from './types';

const DEFAULT_PADDING = 4;

const sameRect = (a: TargetRect | null, b: TargetRect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/**
 * The element's viewport rect grown by `padding`, kept current. It re-measures
 * on window resize, on a scroll of any ancestor (capture phase, passive, as
 * `DropdownMenu` does), when the element resizes and on DOM changes, with
 * every trigger coalesced to one measurement per animation frame.
 */
export function useTargetRect(element: Element | null, padding = DEFAULT_PADDING): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);

  useLayoutEffect(() => {
    if (!element) {
      setRect(null);
      return;
    }

    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const { top, left, width, height } = element.getBoundingClientRect();
      const next = { top: top - padding, left: left - padding, width: width + padding * 2, height: height + padding * 2 };
      setRect((previous) => (sameRect(previous, next) ? previous : next));
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    const unsubscribe = subscribeToDom(schedule);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(element);

    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      unsubscribe();
      resize?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [element, padding]);

  return rect;
}
