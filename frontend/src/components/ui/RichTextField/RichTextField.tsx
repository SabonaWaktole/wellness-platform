import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { Bold, Italic, Link2, Link2Off, List, ListOrdered } from 'lucide-react';
import { DOCUMENT_TEXT_EXTENSIONS } from '../../forms/registry/richTextExtensions';
import type { RichTextDoc } from '../../../types/form';
import { isAllowedHref } from '../../../utils/safeHref';
import styles from './RichTextField.module.css';

export interface RichTextFieldProps {
  label: string;
  /** The stored document, or `null` for none. Read once: re-mount (a new `key`) to load another. */
  value: RichTextDoc | null;
  /** `null` when the text is emptied. */
  onChange: (value: RichTextDoc | null) => void;
  helperText?: string;
  error?: string;
}

/** A typed address as a link: as given when it is one, otherwise read as a web address ("wellness.al"). */
function hrefFrom(input: string): string | null {
  const text = input.trim();
  if (isAllowedHref(text)) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && isAllowedHref(`mailto:${text}`)) return `mailto:${text}`;
  return isAllowedHref(`https://${text}`) && text.includes('.') ? `https://${text}` : null;
}

/** Re-renders on every editor transaction, so the buttons' pressed state follows the caret (see FormattingToolbar). */
function useEditorVersion(editor: Editor | null) {
  const version = useRef(0);
  useSyncExternalStore(
    (onChange) => {
      if (!editor) return () => undefined;
      const handle = () => {
        version.current += 1;
        onChange();
      };
      editor.on('transaction', handle);
      return () => editor.off('transaction', handle);
    },
    () => version.current
  );
}

/**
 * A labelled rich-text field for text written once and shown on documents:
 * the offer texts (M2 Slice 4) and the sales script (Slice 5). Bold, italic,
 * lists and links only, matching what the server stores (NFR-SEC-05); the
 * value is TipTap JSON, never HTML. Unlike the forms canvas editor it has its
 * own undo and no slash menu.
 */
export const RichTextField = ({ label, value, onChange, helperText, error }: RichTextFieldProps) => {
  const { t } = useTranslation('common');
  const labelId = useId();
  const messageId = useId();
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const message = error || helperText;

  const editor = useEditor({
    extensions: DOCUMENT_TEXT_EXTENSIONS,
    content: (value as JSONContent | null) ?? '',
    editorProps: {
      attributes: {
        class: styles.content,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        ...(message ? { 'aria-describedby': messageId } : {}),
        ...(error ? { 'aria-invalid': 'true' } : {}),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? null : (current.getJSON() as RichTextDoc)),
  });
  useEditorVersion(editor);

  const chain = () => editor!.chain().focus();
  const button = (name: string, pressed: boolean, onClick: () => void, icon: ReactNode) => (
    <button
      type="button"
      className={styles.button}
      aria-label={t(`richText.${name}`)}
      title={t(`richText.${name}`)}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={!editor}
    >
      {icon}
    </button>
  );

  const applyLink = () => {
    const href = hrefFrom(linkDraft ?? '');
    if (!href) {
      setLinkError(true);
      return;
    }
    chain().extendMarkRange('link').setLink({ href }).run();
    setLinkDraft(null);
    setLinkError(false);
  };

  const isLink = editor?.isActive('link') ?? false;

  return (
    <div className={styles.container}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div className={`${styles.frame} ${error ? styles.frameError : ''}`}>
        <div className={styles.toolbar} role="toolbar" aria-label={t('richText.toolbar', { label })}>
          {button('bold', editor?.isActive('bold') ?? false, () => chain().toggleBold().run(), <Bold size={16} aria-hidden="true" />)}
          {button('italic', editor?.isActive('italic') ?? false, () => chain().toggleItalic().run(), <Italic size={16} aria-hidden="true" />)}
          {button('bulletList', editor?.isActive('bulletList') ?? false, () => chain().toggleBulletList().run(), <List size={16} aria-hidden="true" />)}
          {button(
            'orderedList',
            editor?.isActive('orderedList') ?? false,
            () => chain().toggleOrderedList().run(),
            <ListOrdered size={16} aria-hidden="true" />
          )}
          {isLink
            ? button('unlink', false, () => chain().extendMarkRange('link').unsetLink().run(), <Link2Off size={16} aria-hidden="true" />)
            : button('link', linkDraft !== null, () => setLinkDraft((draft) => (draft === null ? '' : null)), <Link2 size={16} aria-hidden="true" />)}
        </div>

        {linkDraft !== null && (
          <div className={styles.linkRow}>
            <input
              className={styles.linkInput}
              aria-label={t('richText.linkAddress')}
              placeholder="https://"
              value={linkDraft}
              autoFocus
              onChange={(e) => {
                setLinkDraft(e.target.value);
                setLinkError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === 'Escape') setLinkDraft(null);
              }}
            />
            <button type="button" className={styles.textButton} onClick={applyLink}>
              {t('richText.applyLink')}
            </button>
            <button type="button" className={styles.textButton} onClick={() => setLinkDraft(null)}>
              {t('actions.cancel')}
            </button>
            {linkError && (
              <p className={styles.linkError} role="alert">
                {t('richText.invalidLink')}
              </p>
            )}
          </div>
        )}

        <EditorContent editor={editor} />
      </div>
      {message && (
        <p id={messageId} className={`${styles.helperText} ${error ? styles.helperTextError : ''}`} role={error ? 'alert' : undefined}>
          {message}
        </p>
      )}
    </div>
  );
};
