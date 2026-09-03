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
  if (key === 'Delete' || key === 'Backspace') return { action: 'delete' };

  const nudge = NUDGES[key];
  if (nudge) {
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    return { action: 'nudge', dx: nudge.dx * step, dy: nudge.dy * step };
  }

  if (!mod) return null;

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
    default:
      return null;
  }
};
