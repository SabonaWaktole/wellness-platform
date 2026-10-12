import { afterEach, describe, expect, it } from 'vitest';
import { findLayer, layerIds, layers, topLayer } from './layerStack';

const created: HTMLElement[] = [];
const add = (html: string) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const node = holder.firstElementChild as HTMLElement;
  document.body.append(node);
  created.push(node);
  return node;
};

afterEach(() => created.splice(0).forEach((n) => n.remove()));

describe('SUP-10 layer stack', () => {
  it('SUP-10 finds nothing when no layer is open', () => {
    expect(layers(document)).toEqual([]);
    expect(topLayer(document)).toBeNull();
  });

  it('SUP-10 recognises a modal dialog, a menu and a marked element as layers', () => {
    const dialog = add('<div role="dialog" aria-modal="true"></div>');
    const menu = add('<div role="menu"></div>');
    const marked = add('<div data-tour-layer></div>');
    expect(layers(document)).toEqual([dialog, menu, marked]);
  });

  it('SUP-10 does not take the tour’s own non-modal card for a layer', () => {
    add('<div role="dialog" aria-modal="false"></div>');
    expect(topLayer(document)).toBeNull();
  });

  it('SUP-10 the topmost layer is the last one in the document', () => {
    add('<div role="dialog" aria-modal="true" id="first"></div>');
    const second = add('<div role="dialog" aria-modal="true" id="second"></div>');
    expect(topLayer(document)).toBe(second);
  });

  it('SUP-10 names a layer by its tour id tokens', () => {
    const dialog = add('<div role="dialog" aria-modal="true" data-tour="clients.list.addDialog extra.id" data-tour-layer></div>');
    expect(layerIds(dialog)).toEqual(['clients.list.addDialog', 'extra.id']);
    expect(layerIds(add('<div role="menu"></div>'))).toEqual([]);
  });

  it('SUP-10 finds an open layer by id, and returns null once it is gone', () => {
    const dialog = add('<div role="dialog" aria-modal="true" data-tour="a.dialog" data-tour-layer></div>');
    expect(findLayer(document, 'a.dialog')).toBe(dialog);
    expect(findLayer(document, 'other.dialog')).toBeNull();
    dialog.remove();
    expect(findLayer(document, 'a.dialog')).toBeNull();
  });
});
