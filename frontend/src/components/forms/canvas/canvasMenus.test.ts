import { describe, it, expect, vi } from 'vitest';
import { buildCanvasMenu, type CanvasMenuActions, type CanvasMenuState } from './canvasMenus';

/*
 * The menus are pure data, so their SHAPE is testable without a DOM: which
 * commands appear for which target, in what order, and separated into which
 * groups. The ordering is the desktop convention every user already has —
 * clipboard first, object-specific next, destructive last and alone — and it
 * is worth pinning because it is exactly the kind of thing that drifts as
 * commands are added.
 */

const t = ((key: string) => key.replace('formBuilder.', '')) as never;

const actions = (): CanvasMenuActions => ({
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
  editText: vi.fn(),
  openFormatPane: vi.fn(),
  insertPageBefore: vi.fn(),
  moveToNextPage: vi.fn(),
  duplicatePage: vi.fn(),
  deletePage: vi.fn(),
  removeEmptyPages: vi.fn(),
});

const state = (over: Partial<CanvasMenuState> = {}): CanvasMenuState => ({
  target: 'element',
  canEditText: true,
  canPaste: true,
  canDeletePage: true,
  hasEmptyPages: true,
  canMoveToNextPage: true,
  ...over,
});

const ids = (items: ReturnType<typeof buildCanvasMenu>) =>
  items.filter((i) => i.kind !== 'separator').map((i) => i.id);

const find = (items: ReturnType<typeof buildCanvasMenu>, id: string) =>
  items.find((i) => i.id === id) as Extract<(typeof items)[number], { label: string }>;

describe('buildCanvasMenu', () => {
  it('offers the clipboard verbs on an element, with their shortcuts', () => {
    const items = buildCanvasMenu(state(), actions(), t);

    expect(ids(items).slice(0, 4)).toEqual(['cut', 'copy', 'paste', 'duplicate']);
    expect(find(items, 'cut').shortcut).toBe('Ctrl+X');
  });

  /* Destructive last, alone, behind a divider — not adjacent to Duplicate. */
  it('puts delete last and separates it from everything else', () => {
    const items = buildCanvasMenu(state(), actions(), t);

    expect(items[items.length - 1].id).toBe('delete');
    expect(items[items.length - 2].kind).toBe('separator');
    expect(find(items, 'delete').danger).toBe(true);
  });

  it('offers edit-text only where there is text to edit', () => {
    expect(ids(buildCanvasMenu(state(), actions(), t))).toContain('edit-text');
    expect(ids(buildCanvasMenu(state({ canEditText: false }), actions(), t))).not.toContain('edit-text');
  });

  /* These two exercise layoutOps operations that had no UI at all before. */
  it('offers a section the page operations it can take part in', () => {
    const items = buildCanvasMenu(state({ target: 'section' }), actions(), t);

    expect(ids(items)).toContain('move-next-page');
    expect(ids(items)).toContain('insert-page');
  });

  it('disables move-to-next-page on a single-page document', () => {
    const items = buildCanvasMenu(state({ target: 'section', canMoveToNextPage: false }), actions(), t);
    expect(find(items, 'move-next-page').disabled).toBe(true);
  });

  it('offers page operations on the page background, and no cut or copy', () => {
    const items = buildCanvasMenu(state({ target: 'page' }), actions(), t);

    expect(ids(items)).toEqual([
      'paste',
      'insert-page',
      'duplicate-page',
      'remove-empty',
      'delete-page',
    ]);
  });

  it('disables paste with an empty clipboard, rather than hiding it', () => {
    const items = buildCanvasMenu(state({ canPaste: false }), actions(), t);
    // Hiding it would make the menu's shape change between right-clicks, which
    // is far more disorienting than a greyed-out command.
    expect(find(items, 'paste').disabled).toBe(true);
  });

  it('disables deleting the only page', () => {
    const items = buildCanvasMenu(state({ target: 'page', canDeletePage: false }), actions(), t);
    expect(find(items, 'delete-page').disabled).toBe(true);
  });
});
