import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface Options {
  /** A tour is running: only then is anything listened to. */
  running: boolean;
  /** The tour is waiting for the user to open something (a dialog or menu): the page owns the keyboard. */
  waiting: boolean;
  onExit: () => void;
  onNext: () => void;
  onBack: () => void;
  popoverRef: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * The tour's keyboard, as one `keydown` listener on `document` in the capture
 * phase while a tour runs (and none otherwise).
 *
 * Escape exits and is stopped there, so a Modal or SlideOver behind the tour,
 * whose own Escape listener is on `document` in the bubble phase, does not also
 * close. While the tour waits for the user to open something, Escape belongs to
 * the app layer they opened. Arrows move through the tour only from inside the
 * card and never while typing. Tab wraps inside the card, and never traps the
 * page while the tour waits.
 */
export function useTourKeyboard({ running, waiting, onExit, onNext, onBack, popoverRef }: Options): void {
  const latest = useRef({ waiting, onExit, onNext, onBack });
  useLayoutEffect(() => {
    latest.current = { waiting, onExit, onNext, onBack };
  });

  useEffect(() => {
    if (!running) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const { waiting: isWaiting, onExit: exit, onNext: next, onBack: back } = latest.current;
      const root = popoverRef.current;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === 'Escape') {
        if (isWaiting) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        exit();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (!root || !target || !root.contains(target) || target.closest(TYPING)) return;
        event.preventDefault();
        (event.key === 'ArrowRight' ? next : back)();
        return;
      }

      if (event.key === 'Tab' && !isWaiting && root) {
        const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!active || !root.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [running, popoverRef]);
}
