/**
 * The §21 keyboard shortcut table, as pure resolution.
 *
 * Split from the hook that binds it so the mapping — the part with real rules
 * in it — is testable without a DOM or a rendered editor.
 */

/** Arrow-key nudge, in document px. */
export const NUDGE_STEP = 1;
/** Shift+arrow, for coarse movement (§21). */
export const NUDGE_STEP_LARGE = 10;

export type ShortcutAction =
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'copy' }
  | { action: 'cut' }
  | { action: 'paste' }
  | { action: 'duplicate' }
  | { action: 'selectAll' }
  | { action: 'delete' }
  | { action: 'escape' }
  | { action: 'save' }
  | { action: 'print' }
  | { action: 'zoomIn' }
  | { action: 'zoomOut' }
  | { action: 'zoomReset' }
  | { action: 'nudge'; dx: number; dy: number };

/**
 * Whether the event target is somewhere the user is TYPING.
 *
 * Spec §21: "Text editing must take precedence over object-level shortcuts
 * when the cursor is inside a text editor." Without this, typing `d` into a
 * field label duplicates the field, `Backspace` deletes the field instead of
 * a character, and arrow keys move the element rather than the caret — the
 * single most destructive class of bug an editor like this can ship.
 *
 * `<select>` counts: arrows change its value, and hijacking them would break
 * a control the owner is legitimately operating.
 */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;

  // `closest` rather than a direct check: the caret is usually inside a child
  // node of the contenteditable host, not the host itself.
  return target.closest('[contenteditable="true"], [contenteditable=""]') !== null;
};

/**
 * Whether the event target is a CONTROL that navigates itself with the arrow
 * keys.
 *
 * The ribbon's tab strip is a WAI-ARIA tablist: it moves between tabs with the
 * arrow keys, as the pattern requires. The canvas nudges the selected object
 * with the same keys. With focus on a tab both fired — picking a tab from the
 * keyboard walked the selected field a pixel at a time and left the document
 * dirty for it. The same applies to a menu's roving focus.
 *
 * Deliberately narrow: it gates the NUDGE only. `Escape` and the Ctrl-verbs
 * are document commands wherever focus happens to be sitting, and taking
 * Delete away from a user who just clicked a ribbon button would trade one
 * surprise for another.
 */
export const isArrowNavigableControl = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="tab"], [role="menuitem"], [role="menu"], [role="tablist"]') !== null;
};

const NUDGES: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

export const resolveShortcut = (event: KeyboardEvent): ShortcutAction | null => {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;

  if (key === 'Escape') return { action: 'escape' };

  /*
   * THE UNMODIFIED KEYS FIRST, AND ONLY WHILE UNMODIFIED.
   *
   * These three used to be resolved above the `mod` check, which made
   * Ctrl+Backspace and Ctrl+Delete mean "delete the selected object" — where
   * every editor means "delete the previous word" — and Ctrl+arrow a one-pixel
   * nudge rather than the word-wise movement the same keys have in text.
   * Reading them only when no modifier is held is what keeps a modified
   * chord from arriving as its unmodified self.
   *
   * Shift is deliberately not part of `mod`: Shift+arrow is the coarse nudge,
   * and it has to keep resolving here.
   */
  if (!mod) {
    if (key === 'Delete' || key === 'Backspace') return { action: 'delete' };

    const nudge = NUDGES[key];
    if (nudge) {
      const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
      return { action: 'nudge', dx: nudge.dx * step, dy: nudge.dy * step };
    }

    return null;
  }

  switch (key.toLowerCase()) {
    case 'z':
      return event.shiftKey ? { action: 'redo' } : { action: 'undo' };
    // Ctrl+Y is the other common redo binding; §21 asks for familiar
    // conventions rather than one true binding.
    case 'y':
      return { action: 'redo' };
    case 'c':
      return { action: 'copy' };
    case 'x':
      return { action: 'cut' };
    case 'v':
      return { action: 'paste' };
    case 'd':
      return { action: 'duplicate' };
    case 'a':
      return { action: 'selectAll' };
    // Ctrl+S and Ctrl+P are reflexes in any desktop editor, and both were
    // reaching the BROWSER instead: "save this web page" and the browser's own
    // print dialog for the builder chrome rather than the document.
    case 's':
      return { action: 'save' };
    case 'p':
      return { action: 'print' };
    /*
     * ZOOM. Ctrl+0 / Ctrl+plus / Ctrl+minus are the bindings a document editor
     * is expected to answer, and they were falling through to the BROWSER —
     * which zooms the whole application, chrome and all, rather than the page
     * being edited. That leaves the ribbon and the sheet at different scales
     * and the pointer maths measuring a page that is no longer the size the
     * document says it is.
     *
     * Both spellings of each key: `=` and `-` are what the unshifted keys
     * report, `+` and `_` what they report with Shift, and a user pressing
     * Ctrl+Shift+= means "bigger" just as much as one who did not reach for
     * Shift.
     */
    case '0':
      return { action: 'zoomReset' };
    case '=':
    case '+':
      return { action: 'zoomIn' };
    case '-':
    case '_':
      return { action: 'zoomOut' };
    default:
      return null;
  }
};
