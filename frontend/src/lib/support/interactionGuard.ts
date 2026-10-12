import type { GuideStep, StepSafety } from './types';

/**
 * What stops a running tour from operating the page.
 *
 * While a tour runs, the page is a read-only museum: a click, a press or an
 * Enter/Space on a control that is not the tour's own is cancelled in the
 * capture phase, before the application's handlers see it, and forms cannot be
 * submitted. Scrolling, Tab and typing in a text field keep working. The guard
 * only ever cancels; it never clicks, submits or dispatches anything.
 */

export type BlockKind = 'click' | 'pointer' | 'key' | 'submit' | 'drag';

export interface GuardContext {
  /** Whether the user may operate this element right now (the tour's own UI, a try-it target, an open layer). */
  allows: (target: Element) => boolean;
  /** Something was cancelled. Called for the pointer, the keyboard, a submit and a drag, but not for touch scrolling. */
  onBlocked: (target: Element, kind: BlockKind) => void;
}

/** Elements that Enter or Space operate. A text field is not one: typing in it is not an action. */
const ACTIVATABLE = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="option"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="file"]',
].join(', ');

const asElement = (target: EventTarget | null): Element | null => (target instanceof Element ? target : null);

/** The tour's own controls are always usable. Tour UI marks itself with `data-support-ui`. */
export const isSupportUi = (element: Element): boolean => element.closest('[data-support-ui]') !== null;

/**
 * Installs the guard. `getContext` is read on every event, so a step change
 * changes what is allowed without reinstalling. Returns the remover.
 */
export function installGuard(getContext: () => GuardContext): () => void {
  const handlers: Array<[string, EventListener, AddEventListenerOptions]> = [];
  const on = (type: string, handler: (event: Event, target: Element) => void, options: AddEventListenerOptions = {}) => {
    const listener: EventListener = (event) => {
      const target = asElement(event.target);
      if (target) handler(event, target);
    };
    handlers.push([type, listener, { capture: true, ...options }]);
  };

  const block = (event: Event, target: Element, kind: BlockKind) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    getContext().onBlocked(target, kind);
  };

  for (const type of ['click', 'pointerdown', 'mousedown'] as const) {
    on(type, (event, target) => {
      if (!getContext().allows(target)) block(event, target, type === 'click' ? 'click' : 'pointer');
    });
  }

  // A touch must stay free to scroll, so it is hidden from the application but not cancelled; the tap's click is.
  on(
    'touchstart',
    (event, target) => {
      if (!getContext().allows(target)) event.stopImmediatePropagation();
    },
    { passive: true },
  );

  on('keydown', (event, target) => {
    const key = (event as KeyboardEvent).key;
    if ((key !== 'Enter' && key !== ' ') || !target.closest(ACTIVATABLE)) return;
    if (!getContext().allows(target)) block(event, target, 'key');
  });

  // Never, not even from a field the user may type in.
  on('submit', (event, target) => {
    if (!isSupportUi(target)) block(event, target, 'submit');
  });

  on('dragstart', (event, target) => {
    if (!getContext().allows(target)) block(event, target, 'drag');
  });

  for (const [type, listener, options] of handlers) document.addEventListener(type, listener, options);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    for (const [type, listener, options] of handlers) document.removeEventListener(type, listener, options);
  };
}

/** A step that needs care is explain-only whatever it declares. */
export const effectiveSafety = (step: Pick<GuideStep, 'warning' | 'safety'>): StepSafety =>
  step.warning ? 'explain-only' : (step.safety ?? 'explain-only');

/** In development, a destructive step that reaches run time as try-it is an error. */
export function assertStepSafety(step: Pick<GuideStep, 'id' | 'warning' | 'safety'>): void {
  if (import.meta.env.DEV && step.warning && step.safety === 'try-it') {
    throw new Error(`Step "${step.id}" is flagged destructive (warning) but declares try-it; destructive steps are explain-only.`);
  }
}
