import { useEffect, useRef, type RefObject } from 'react';

/**
 * Remembers where focus was when the tour began, moves it to the card's
 * heading on every step, and gives it back at the end: to the remembered
 * element if it is still on the page, otherwise to `main`.
 */
export function useTourFocus(active: boolean, headingRef: RefObject<HTMLElement | null>, stepKey: string | null): void {
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = origin.current;
      origin.current = null;
      if (target && target !== document.body && target.isConnected) {
        target.focus();
        return;
      }
      const main = document.querySelector('main');
      if (!main) return;
      // `main` is not focusable by default; make it so only until focus moves on.
      if (!main.hasAttribute('tabindex')) {
        main.setAttribute('tabindex', '-1');
        main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
      }
      main.focus({ preventScroll: true });
    };
  }, [active]);

  useEffect(() => {
    if (active) headingRef.current?.focus({ preventScroll: true });
  }, [active, stepKey, headingRef]);
}
