import { describe, it, expect } from 'vitest';
import { resolveShortcut, isTextEntryTarget, NUDGE_STEP, NUDGE_STEP_LARGE } from './keyboard';

const ev = (over: Partial<KeyboardEvent> = {}) =>
  ({ key: 'a', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over }) as KeyboardEvent;

const el = (tag: string, attrs: Record<string, string> = {}) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

describe('isTextEntryTarget', () => {
  /*
   * SPEC §21's hard rule: "Text editing must take precedence over
   * object-level shortcuts when the cursor is inside a text editor."
   * Getting this wrong means typing "d" in a label duplicates the field, and
   * Backspace deletes it instead of a character.
   */
  it('treats inputs, textareas and contenteditable as text entry', () => {
    expect(isTextEntryTarget(el('input'))).toBe(true);
    expect(isTextEntryTarget(el('textarea'))).toBe(true);
    expect(isTextEntryTarget(el('div', { contenteditable: 'true' }))).toBe(true);
  });

  it('treats a select as text entry too — arrows change its value', () => {
    expect(isTextEntryTarget(el('select'))).toBe(true);
  });

  it('does not treat the canvas or a button as text entry', () => {
    expect(isTextEntryTarget(el('div'))).toBe(false);
    expect(isTextEntryTarget(el('button'))).toBe(false);
  });

  it('treats a node INSIDE a contenteditable as text entry', () => {
    const host = el('div', { contenteditable: 'true' });
    const span = el('span');
    host.appendChild(span);
    expect(isTextEntryTarget(span)).toBe(true);
  });

  it('is safe with null', () => {
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe('resolveShortcut', () => {
  it('maps the §21 table', () => {
    expect(resolveShortcut(ev({ key: 'z', ctrlKey: true }))).toEqual({ action: 'undo' });
    expect(resolveShortcut(ev({ key: 'z', ctrlKey: true, shiftKey: true }))).toEqual({ action: 'redo' });
    expect(resolveShortcut(ev({ key: 'c', ctrlKey: true }))).toEqual({ action: 'copy' });
    expect(resolveShortcut(ev({ key: 'x', ctrlKey: true }))).toEqual({ action: 'cut' });
    expect(resolveShortcut(ev({ key: 'v', ctrlKey: true }))).toEqual({ action: 'paste' });
    expect(resolveShortcut(ev({ key: 'd', ctrlKey: true }))).toEqual({ action: 'duplicate' });
    expect(resolveShortcut(ev({ key: 'a', ctrlKey: true }))).toEqual({ action: 'selectAll' });
    expect(resolveShortcut(ev({ key: 'Escape' }))).toEqual({ action: 'escape' });
    expect(resolveShortcut(ev({ key: 'Delete' }))).toEqual({ action: 'delete' });
    expect(resolveShortcut(ev({ key: 'Backspace' }))).toEqual({ action: 'delete' });
  });

  it('accepts Cmd as well as Ctrl', () => {
    expect(resolveShortcut(ev({ key: 'z', metaKey: true }))).toEqual({ action: 'undo' });
  });

  it('maps arrows to a 1px nudge', () => {
    expect(resolveShortcut(ev({ key: 'ArrowLeft' }))).toEqual({ action: 'nudge', dx: -NUDGE_STEP, dy: 0 });
    expect(resolveShortcut(ev({ key: 'ArrowDown' }))).toEqual({ action: 'nudge', dx: 0, dy: NUDGE_STEP });
  });

  it('maps Shift+arrow to the larger step', () => {
    expect(resolveShortcut(ev({ key: 'ArrowRight', shiftKey: true }))).toEqual({
      action: 'nudge',
      dx: NUDGE_STEP_LARGE,
      dy: 0,
    });
  });

  it('returns null for an unmapped key', () => {
    expect(resolveShortcut(ev({ key: 'q' }))).toBeNull();
    expect(resolveShortcut(ev({ key: 'F5' }))).toBeNull();
  });

  /* Ctrl+Shift+Z and Ctrl+Y are both common redo bindings. */
  /*
   * Save and print are the two document-level commands every desktop editor
   * binds. Both were absent: Ctrl+S fell through to the browser's "save this
   * web page" dialog, which for an editor that autosaves is not merely
   * useless but actively misleading about where the work has gone.
   */
  it('maps Ctrl+S to save and Ctrl+P to print', () => {
    expect(resolveShortcut(ev({ key: 's', ctrlKey: true }))).toEqual({ action: 'save' });
    expect(resolveShortcut(ev({ key: 'p', ctrlKey: true }))).toEqual({ action: 'print' });
    expect(resolveShortcut(ev({ key: 's', metaKey: true }))).toEqual({ action: 'save' });
  });

  it('accepts Ctrl+Y as redo', () => {
    expect(resolveShortcut(ev({ key: 'y', ctrlKey: true }))).toEqual({ action: 'redo' });
  });

  it('ignores a bare letter — that is typing, not a command', () => {
    expect(resolveShortcut(ev({ key: 'd' }))).toBeNull();
  });

  /*
   * ZOOM. Unbound, these three reached the BROWSER, which zooms the whole
   * application — ribbon, page rail and sheet together — rather than the
   * document. That is not a smaller version of the right answer: it leaves the
   * chrome and the page at different scales, and the pointer maths measuring a
   * sheet that is no longer the size the document says it is.
   */
  it('maps Ctrl+0 to the natural size', () => {
    expect(resolveShortcut(ev({ key: '0', ctrlKey: true }))).toEqual({ action: 'zoomReset' });
    expect(resolveShortcut(ev({ key: '0', metaKey: true }))).toEqual({ action: 'zoomReset' });
  });

  /*
   * Both spellings of each key. `=` and `-` are what the unshifted keys
   * report; `+` and `_` are what they report with Shift held, and someone
   * pressing Ctrl+Shift+= means "bigger" just as much as someone who did not
   * reach for Shift.
   */
  it('maps Ctrl+plus and Ctrl+minus to zoom, shifted or not', () => {
    expect(resolveShortcut(ev({ key: '=', ctrlKey: true }))).toEqual({ action: 'zoomIn' });
    expect(resolveShortcut(ev({ key: '+', ctrlKey: true }))).toEqual({ action: 'zoomIn' });
    expect(resolveShortcut(ev({ key: '-', ctrlKey: true }))).toEqual({ action: 'zoomOut' });
    expect(resolveShortcut(ev({ key: '_', ctrlKey: true }))).toEqual({ action: 'zoomOut' });
  });

  /* Without the modifier these are ordinary characters someone is typing. */
  it('leaves the same keys alone without a modifier', () => {
    expect(resolveShortcut(ev({ key: '0' }))).toBeNull();
    expect(resolveShortcut(ev({ key: '=' }))).toBeNull();
    expect(resolveShortcut(ev({ key: '-' }))).toBeNull();
  });
});
