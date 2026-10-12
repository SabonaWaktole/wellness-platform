import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Namespace } from '../../i18n/config';
import { useSupportStore } from '../../store/useSupportStore';
import { subscribeToDom } from './domObserverHub';
import type { Translate } from './defineGuide';
import { installGuard, isSupportUi } from './interactionGuard';
import { loadGuide } from './pageRegistry';
import { candidateName, resolvePickCopy, type PickCopy } from './pickCopy';
import { scrollTargetIntoView } from './scrollTargetIntoView';
import { loadSupportCopy } from './supportCopy';
import { isVisible } from './targetResolver';
import type { PageGuide } from './types';

export interface PickMode {
  /** The element to draw the spotlight on: the one picked, else the one under the pointer or keyboard. */
  highlight: Element | null;
  /** What to announce for the highlighted control. */
  candidateName: string;
  picked: { element: Element; id: string } | null;
  /** What is said about the picked control. */
  pickedCopy: PickCopy | null;
  pickAnother: () => void;
  close: () => void;
}

/** The nearest annotated element at or above `node`, ignoring Support's own UI. */
const nearestTarget = (node: EventTarget | null): Element | null => {
  const element = node instanceof Element ? node : null;
  if (!element || isSupportUi(element)) return null;
  const target = element.closest('[data-tour]');
  return target && !isSupportUi(target) ? target : null;
};

/** Every annotated control that is on screen, in page order, looked up fresh each time. */
const visibleTargets = (): Element[] => Array.from(document.querySelectorAll('[data-tour]')).filter((el) => !isSupportUi(el) && isVisible(el));

/**
 * Point-and-ask. The pointer highlights the nearest annotated element and a
 * click explains it; Tab and Shift+Tab walk the annotated controls, Enter
 * explains the one highlighted, and Escape leaves. Clicks are swallowed by the
 * read-only guard, so the control itself never fires. Everything is looked up
 * on each move or key press, so controls that appear later are reachable.
 */
export function usePickMode(): PickMode {
  const { t } = useTranslation();
  const translate = t as unknown as Translate;
  const pageId = useSupportStore((state) => state.context.pageId);
  const [guide, setGuide] = useState<PageGuide | null>(null);
  const [candidate, setCandidate] = useState<Element | null>(null);
  const [picked, setPicked] = useState<{ element: Element; id: string } | null>(null);
  const [, redraw] = useState(0);

  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  // The page's guide, if it has one. A page without one still has its header, menu and shared kinds to ask about.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = pageId ? await loadGuide(pageId).catch(() => null) : null;
      await Promise.all([loadSupportCopy('support'), loaded ? loadSupportCopy(loaded.namespace as Namespace) : undefined]);
      if (!cancelled) setGuide(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const close = useCallback(() => useSupportStore.getState().endSession(), []);
  const select = useCallback((element: Element) => {
    setCandidate(element);
    setPicked({ element, id: element.getAttribute('data-tour')?.split(/\s+/)[0] ?? '' });
  }, []);

  useEffect(() => {
    const onMove = (event: Event) => {
      if (!pickedRef.current) setCandidate(nearestTarget(event.target));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const swallow = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (event.key === 'Escape') {
        swallow();
        close();
        return;
      }
      // With a card up, Tab and Enter belong to the card.
      if (pickedRef.current) return;

      if (event.key === 'Tab') {
        const targets = visibleTargets();
        if (targets.length === 0) return;
        swallow();
        const at = candidateRef.current ? targets.indexOf(candidateRef.current) : -1;
        const next = event.shiftKey ? (at <= 0 ? targets.length - 1 : at - 1) : at === -1 || at === targets.length - 1 ? 0 : at + 1;
        setCandidate(targets[next]);
        scrollTargetIntoView(targets[next]);
      } else if (event.key === 'Enter' && candidateRef.current && !(event.target instanceof Element && isSupportUi(event.target))) {
        swallow();
        select(candidateRef.current);
      }
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: true });
    document.addEventListener('keydown', onKeyDown, true);
    // Registered after the keyboard handler, so Enter reaches it before the guard sees it.
    const removeGuard = installGuard(() => ({
      allows: (el) => isSupportUi(el) || el === document.documentElement || el === document.body,
      onBlocked: (el, kind) => {
        const target = kind === 'click' ? nearestTarget(el) : null;
        if (target) select(target);
      },
    }));
    // A highlighted element that leaves the page must not leave a spotlight behind.
    const removeObserver = subscribeToDom(() => redraw((n) => n + 1));

    return () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('keydown', onKeyDown, true);
      removeGuard();
      removeObserver();
    };
  }, [close, select]);

  const pickedCopy = useMemo(() => (picked ? resolvePickCopy(picked.element, guide, translate) : null), [picked, guide, translate]);
  const highlightRaw = picked?.element ?? candidate;
  const highlight = highlightRaw?.isConnected ? highlightRaw : null;

  return {
    highlight,
    candidateName: highlight && !picked ? candidateName(highlight, guide, translate) : '',
    picked,
    pickedCopy,
    pickAnother: () => {
      setPicked(null);
      setCandidate(null);
    },
    close,
  };
}
