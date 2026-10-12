import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { subscribeToDom } from './domObserverHub';
import { resolveTarget } from './targetResolver';
import type { TargetRect, TargetSpec, TargetStatus } from './types';

export interface TargetElementState {
  element: Element | null;
  status: TargetStatus;
  rect: TargetRect | null;
}

interface Options {
  /** How long a busy region may keep a target `pending` before it is reported `missing`. */
  waitMs?: number;
}

const EMPTY: TargetElementState = { element: null, status: 'missing', rect: null };
const DEFAULT_WAIT_MS = 4000;

const measure = (element: Element): TargetRect => {
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
};

const sameState = (a: TargetElementState, b: TargetElementState) =>
  a.element === b.element &&
  a.status === b.status &&
  a.rect?.top === b.rect?.top &&
  a.rect?.left === b.rect?.left &&
  a.rect?.width === b.rect?.width &&
  a.rect?.height === b.rect?.height;

const specKey = (spec: TargetSpec | null) =>
  spec ? [spec.id, spec.repeat, spec.pick, spec.nth, spec.within, spec.scope].join('|') : null;

/**
 * Where is this step's control right now, and in what state?
 *
 * Subscribes to the shared DOM hub and re-resolves on every settled change, so
 * an element that is added, removed, replaced or disabled updates the result
 * once per frame. A `ResizeObserver` on the active element keeps `rect` current
 * without waiting for a DOM change.
 */
export function useTargetElement(spec: TargetSpec | null, { waitMs = DEFAULT_WAIT_MS }: Options = {}): TargetElementState {
  const [state, setState] = useState<TargetElementState>(EMPTY);
  const key = specKey(spec);
  const specRef = useRef(spec);
  specRef.current = spec;

  const previous = useRef<Element | null>(null);
  const pendingSince = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned = useRef<Set<string>>(new Set());
  const evaluateRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    previous.current = null;
    pendingSince.current = null;
    warned.current = new Set();
    const current = specRef.current;
    if (!current) {
      setState(EMPTY);
      return;
    }

    const clearTimer = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };

    const evaluate = () => {
      const target = specRef.current;
      if (!target) return;
      const resolution = resolveTarget(target, { previous: previous.current });
      if (resolution.element) previous.current = resolution.element;

      let status = resolution.status;
      if (status === 'pending') {
        const now = Date.now();
        pendingSince.current ??= now;
        const remaining = waitMs - (now - pendingSince.current);
        if (remaining <= 0) {
          status = 'missing';
        } else if (timer.current === null) {
          timer.current = setTimeout(() => {
            timer.current = null;
            evaluate();
          }, remaining);
        }
      } else {
        pendingSince.current = null;
        clearTimer();
      }

      if (import.meta.env.DEV && !target.repeat && resolution.count > 1 && !warned.current.has(target.id)) {
        warned.current.add(target.id);
        console.warn(`Support: "${target.id}" is on ${resolution.count} visible elements but is not declared repeat. Using the first.`);
      }

      const next: TargetElementState = {
        element: resolution.element,
        status,
        rect: resolution.element ? measure(resolution.element) : null,
      };
      setState((prev) => (sameState(prev, next) ? prev : next));
    };

    evaluateRef.current = evaluate;
    evaluate();
    const unsubscribe = subscribeToDom(evaluate);
    return () => {
      unsubscribe();
      clearTimer();
    };
    // `waitMs` is read once per spec; a changed spec re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, waitMs]);

  const { element } = state;
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => evaluateRef.current());
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return state;
}
