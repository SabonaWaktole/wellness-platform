import React, { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { RICH_TEXT_EXTENSIONS } from './richTextExtensions';
import type { RichTextDoc } from '../../../types/form';
import styles from './RichTextEditor.module.css';

export interface RichTextEditorProps {
  content: RichTextDoc;
  onChange: (content: RichTextDoc) => void;
  /** Surfaces the live editor instance one level up, for the formatting
   *  toolbar to drive (bold/align/etc act on whichever editor has focus). */
  onEditorReady?: (editor: Editor | null) => void;
  autoFocus?: boolean;
}

/**
 * The interactive editor for a TEXT component (spec §10) — familiar to
 * anyone who has used Google Docs or Word, without leaving the canvas.
 *
 * Deliberately opaque to the canvas's own click-to-select behaviour: a click
 * that lands inside the editor enters TEXT EDITING, not object selection —
 * `stopPropagation` on pointerdown is what keeps `CanvasElement`'s selection
 * click from firing first and stealing focus before the caret can land.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  onEditorReady,
  autoFocus,
}) => {
  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: content as unknown as Record<string, unknown>,
    autofocus: autoFocus ?? false,
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as unknown as RichTextDoc),
  });

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // An external change (undo/redo, a paste from elsewhere in the app) must
  // resync the editor's own document — but never while the owner is actively
  // typing in THIS instance, or every keystroke would fight its own commit.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content as unknown as Record<string, unknown>, { emitUpdate: false });
  }, [editor, content]);

  return (
    <div
      className={styles.host}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
};
