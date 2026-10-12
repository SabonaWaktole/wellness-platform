/**
 * Which dialogs, drawers and menus are open on the page right now. A tour
 * scopes its lookups to the topmost one while it is open, and the layer
 * watcher uses the same definition to tell when a layer opens or closes.
 */

export const LAYER_SELECTOR = '[role="dialog"][aria-modal="true"], [role="menu"], [data-tour-layer]';

/** Every open layer, in document order. The tour's own card (a non-modal dialog) is not one. */
export const layers = (doc: Document): Element[] => Array.from(doc.querySelectorAll(LAYER_SELECTOR));

/** Layers are portalled to the end of the body, so the last in document order is the topmost. */
export function topLayer(doc: Document): Element | null {
  const all = layers(doc);
  return all.length > 0 ? all[all.length - 1] : null;
}

/** The tour ids a layer carries (`data-tour` is a space separated list of tokens). */
export const layerIds = (layer: Element): string[] => (layer.getAttribute('data-tour') ?? '').split(/\s+/).filter(Boolean);

/** The open layer carrying `id`, or null once it is gone. */
export const findLayer = (doc: Document, id: string): Element | null => layers(doc).find((layer) => layerIds(layer).includes(id)) ?? null;
