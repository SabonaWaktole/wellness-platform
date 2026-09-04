import { useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { isDataBearing, type FormElement } from '../../../types/form';

/**
 * WHICH PIECE OF TEXT THE CARET IS CURRENTLY IN (spec §7, §8).
 *
 * The builder has three states — nothing selected, an object selected, and a
 * caret live inside the document — and the user must always be able to tell
 * which one they are in. Selection covers the first two; this covers the
 * third.
 *
 * It is deliberately SEPARATE from selection rather than a fourth selection
 * kind, because of one invariant that makes Escape behave the way Word users
 * expect: while a caret is open, the selection still points at the object
 * being typed into. Escape therefore steps back exactly one level — out of
 * the text, onto the object — instead of dropping the user all the way to
 * nothing. Folding the two together would make that impossible to express.
 */
export type EditTarget =
  /** A TEXT block: the element's own box IS the text box, edited by TipTap. */
  | { kind: 'element-text'; id: string }
  /** The label above a form field, edited as a single line. */
  | { kind: 'field-label'; id: string }
  /** A section's heading, edited as a single line. */
  | { kind: 'section-title'; id: string };

export interface InlineEditing {
  target: EditTarget | null;
  /** True when `id` is the object currently being typed into. */
  isEditing: (id: string) => boolean;
  /**
   * The live TipTap instance while a rich session is open — what the ribbon's
   * formatting controls drive. Null during a plain single-line session, and
   * whenever no caret is open.
   */
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  begin: (target: EditTarget) => void;
  end: () => void;
}

/**
 * What a double-click on this element should open, or `null` if the element
 * has no text of its own.
 *
 * IMAGE and DIVIDER return null deliberately: Word opens the format surface
 * for a picture on double-click, it does not invent a caret where there is no
 * text.
 */
export const defaultTargetFor = (element: FormElement): EditTarget | null => {
  if (element.type === 'TEXT') return { kind: 'element-text', id: element.id };
  if (isDataBearing(element.type) && element.field) return { kind: 'field-label', id: element.id };
  return null;
};

export const useInlineEditing = (): InlineEditing => {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const begin = useCallback((next: EditTarget) => {
    // Replacing one open session with another drops the previous editor
    // instance with it; holding a stale one would leave the ribbon driving an
    // editor that is no longer mounted.
    setEditor(null);
    setTarget(next);
  }, []);

  const end = useCallback(() => {
    setEditor(null);
    setTarget(null);
  }, []);

  const isEditing = useCallback((id: string) => target?.id === id, [target]);

  return { target, isEditing, editor, setEditor, begin, end };
};
