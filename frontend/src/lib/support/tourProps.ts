import type { StepKind } from './types';

/**
 * The grammar of a tour id: a lowercase page or component word, then one or
 * more dotted segments (`clients.list.add`, `settings.pricing.tabs.tab.zones`).
 */
export const TOUR_ID_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9-]*)+$/;

const warned = new Set<string>();

interface TourPropsOptions {
  /** The id is deliberately on many elements (rows, cards). */
  repeat?: boolean;
  kind?: StepKind;
}

/**
 * The attributes that make an element findable by a tour. Spread onto a
 * component that forwards rest props, or onto a plain element. With no id it
 * returns nothing, so a shared component can spread it unconditionally and
 * add no attribute when its caller did not ask for one.
 */
export function tourProps(id: string | undefined, { repeat, kind }: TourPropsOptions = {}): Record<string, string> {
  if (!id) return {};
  if (import.meta.env.DEV && !TOUR_ID_PATTERN.test(id) && !warned.has(id)) {
    warned.add(id);
    console.warn(`Support: "${id}" is not a valid tour id (expected something like "clients.list.add").`);
  }
  return {
    'data-tour': id,
    ...(repeat ? { 'data-tour-repeat': '' } : {}),
    ...(kind ? { 'data-tour-kind': kind } : {}),
  };
}

/** `tourProps` for a dialog or panel: also marks it as a layer, so the tour scopes to it while it is open. */
export function tourLayerProps(id: string | undefined): Record<string, string> {
  return id ? { ...tourProps(id), 'data-tour-layer': '' } : {};
}

/** Builds a derived id from a base and segments, turning anything outside the grammar (a column called `created_at`) into a hyphen. */
export const tourPath = (...parts: string[]): string => parts.map((part) => part.replace(/[^A-Za-z0-9.-]/g, '-')).join('.');
