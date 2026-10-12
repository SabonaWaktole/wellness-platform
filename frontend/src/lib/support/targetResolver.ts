import { topLayer } from './layerStack';
import type { TargetScope, TargetSpec, TargetStatus } from './types';

/**
 * Finds the real element for a step, and says what state it is in. Pure
 * functions over a document: the lookup runs when it is needed and again on
 * every settled change, so a stale element is never held.
 */

const BUSY_SELECTOR = '[aria-busy="true"], [data-tour-busy]';

export interface Resolution {
  element: Element | null;
  status: TargetStatus;
  /** Visible elements carrying the token, before picking one. More than one for a non-repeat id is a bug. */
  count: number;
}

export interface ResolveOptions {
  /** The element this step resolved to earlier, so a vanished one can be reported as `lost`. */
  previous?: Element | null;
  doc?: Document;
}

export function scopeRoot(doc: Document, forced?: TargetScope): ParentNode {
  const main = doc.querySelector('main');
  if (forced === 'shell') return doc;
  if (forced === 'page') return main ?? doc;
  return topLayer(doc) ?? main ?? doc;
}

export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export const isDisabled = (element: Element): boolean =>
  element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';

export const isBusy = (element: Element): boolean => element.closest(BUSY_SELECTOR) !== null;

const isOffscreen = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth;
};

/** `a.b.c` matches `data-tour="a.b.c"` and `data-tour="x.y a.b.c"`, never `a.b.cd`. */
const tokenSelector = (id: string) => `[data-tour~="${id.replace(/["\\]/g, '\\$&')}"]`;

const hasBusyRegion = (root: ParentNode): boolean =>
  (root instanceof Element && isBusy(root)) || root.querySelector(BUSY_SELECTOR) !== null;

export function resolveTarget(spec: TargetSpec, options: ResolveOptions = {}): Resolution {
  const doc = options.doc ?? document;
  const root = scopeRoot(doc, spec.scope);

  let searchIn: ParentNode = root;
  if (spec.within) {
    const parent = resolveTarget({ id: spec.within, repeat: true, scope: spec.scope }, { doc });
    if (!parent.element) return notFound(root, options.previous, 0);
    searchIn = parent.element;
  }

  const visible = Array.from(searchIn.querySelectorAll(tokenSelector(spec.id))).filter(isVisible);
  const element = spec.pick === 'nth' ? visible[spec.nth ?? 0] : visible[0];
  if (!element) return notFound(root, options.previous, visible.length);

  const status: TargetStatus = isDisabled(element) ? 'disabled' : isOffscreen(element) ? 'offscreen' : 'found';
  return { element, status, count: visible.length };
}

function notFound(root: ParentNode, previous: Element | null | undefined, count: number): Resolution {
  if (previous && !previous.isConnected) return { element: null, status: 'lost', count };
  return { element: null, status: hasBusyRegion(root) ? 'pending' : 'missing', count };
}
