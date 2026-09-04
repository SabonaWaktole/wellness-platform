import React, { useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
} from 'lucide-react';
import styles from './FormattingToolbar.module.css';

export interface FormattingToolbarProps {
  editor: Editor | null;
}

const FONT_FAMILIES = ['Inter', 'Georgia', 'Times New Roman', 'Arial', 'Courier New'];
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
const LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2'];

/**
 * The contextual formatting bar for the TEXT component's editor (spec §10,
 * §22). Lives in the properties sidebar next to the `RichTextEditor` it
 * drives — see FormBuilder.tsx's rationale for that placement instead of a
 * floating canvas toolbar.
 *
 * Every command re-focuses the editor as part of its own chain
 * (`.focus()...run()`), which is what keeps clicking a toolbar button from
 * blurring the editor and losing the current selection.
 */
export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({ editor }) => {
  const { t } = useTranslation('forms');

  // TipTap's Editor emits 'transaction' on every state change (typing,
  // selection move, a command running) — subscribing via useSyncExternalStore
  // is what keeps the toolbar's active/inactive button states in sync with
  // the caret without polling.
  //
  // The snapshot is a plain incrementing counter, not a derived value like
  // "selection.from + selection.to". Toggling a mark on an existing
  // selection (click Bold, selection unchanged) changes NOTHING about the
  // selection's position — React Compiler/useSyncExternalStore sees an
  // identical snapshot and skips the re-render, so the button's
  // `aria-pressed` state visibly goes stale one click behind the actual
  // document even though ProseMirror already applied the mark. A counter
  // that bumps on every 'transaction', regardless of what changed, is the
  // only snapshot shape that cannot alias two different editor states onto
  // the same value. Caught by FormattingToolbar.test.tsx driving a real
  // editor rather than a mock.
  const version = useRef(0);
  useSyncExternalStore(
    (onChange) => {
      if (!editor) return () => undefined;
      const handleTransaction = () => {
        version.current += 1;
        onChange();
      };
      editor.on('transaction', handleTransaction);
      return () => editor.off('transaction', handleTransaction);
    },
    () => version.current
  );

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const currentAttrs = (name: string): Record<string, unknown> => editor.getAttributes(name);

  const toggleHeading = (level: '' | '1' | '2' | '3') => {
    if (level === '') editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: Number(level) as 1 | 2 | 3 }).run();
  };

  return (
    <div className={styles.bar} role="toolbar" aria-label={t('formattingToolbar.label')}>
      <select
        className={styles.select}
        aria-label={t('formattingToolbar.paragraphStyle')}
        value={isActive('heading', { level: 1 }) ? '1' : isActive('heading', { level: 2 }) ? '2' : isActive('heading', { level: 3 }) ? '3' : ''}
        onChange={(e) => toggleHeading(e.target.value as '' | '1' | '2' | '3')}
      >
        <option value="">{t('formattingToolbar.paragraph')}</option>
        <option value="1">{t('formattingToolbar.heading1')}</option>
        <option value="2">{t('formattingToolbar.heading2')}</option>
        <option value="3">{t('formattingToolbar.heading3')}</option>
      </select>

      <select
        className={styles.select}
        aria-label={t('formattingToolbar.fontFamily')}
        value={(currentAttrs('textStyle').fontFamily as string) ?? ''}
        onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
      >
        <option value="">{t('formattingToolbar.defaultFont')}</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <select
        className={styles.select}
        aria-label={t('formattingToolbar.fontSize')}
        value={(currentAttrs('textStyle').fontSize as string) ?? ''}
        onChange={(e) => {
          if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
      >
        <option value="">{t('formattingToolbar.defaultSize')}</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className={styles.group}>
        <ToggleButton active={isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label={t('formattingToolbar.bold')}>
          <Bold size={14} />
        </ToggleButton>
        <ToggleButton active={isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label={t('formattingToolbar.italic')}>
          <Italic size={14} />
        </ToggleButton>
        <ToggleButton active={isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label={t('formattingToolbar.underline')}>
          <UnderlineIcon size={14} />
        </ToggleButton>
        <ToggleButton active={isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} label={t('formattingToolbar.strikethrough')}>
          <Strikethrough size={14} />
        </ToggleButton>
      </div>

      <div className={styles.group}>
        {(['left', 'center', 'right', 'justify'] as const).map((align) => {
          const Icon = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[align];
          return (
            <ToggleButton
              key={align}
              active={isActive({ textAlign: align } as never) || editor.isActive('paragraph', { textAlign: align }) || editor.isActive('heading', { textAlign: align })}
              onClick={() => editor.chain().focus().setTextAlign(align).run()}
              label={t(`formattingToolbar.align.${align}`)}
            >
              <Icon size={14} />
            </ToggleButton>
          );
        })}
      </div>

      <div className={styles.group}>
        <ToggleButton active={isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label={t('formattingToolbar.bulletList')}>
          <List size={14} />
        </ToggleButton>
        <ToggleButton active={isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label={t('formattingToolbar.orderedList')}>
          <ListOrdered size={14} />
        </ToggleButton>
      </div>

      <label className={styles.colorField}>
        {t('formattingToolbar.textColor')}
        <input
          type="color"
          value={(currentAttrs('textStyle').color as string) ?? '#000000'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      <label className={styles.colorField}>
        {t('formattingToolbar.highlight')}
        <input
          type="color"
          value={(currentAttrs('textStyle').backgroundColor as string) ?? '#ffffff'}
          onChange={(e) => editor.chain().focus().setBackgroundColor(e.target.value).run()}
        />
      </label>

      <select
        className={styles.select}
        aria-label={t('formattingToolbar.lineHeight')}
        value={(currentAttrs(isActive('heading') ? 'heading' : 'paragraph').lineHeight as string) ?? ''}
        onChange={(e) => {
          // The bundled LineHeight extension's own setLineHeight/unsetLineHeight
          // commands are hardcoded to `setMark('textStyle', { lineHeight })` —
          // but this extension is configured with `types: ['paragraph',
          // 'heading']` (block-level, matching the backend schema and
          // RichTextReadOnly, both of which read lineHeight off the paragraph/
          // heading NODE, not an inline mark). Calling the built-in commands
          // is therefore a silent no-op: `textStyle`'s schema no longer
          // declares `lineHeight`, so the mark update drops it. Setting the
          // node attribute directly via updateAttributes is what actually
          // reaches the schema this extension was configured for.
          const blockType = isActive('heading') ? 'heading' : 'paragraph';
          editor.chain().focus().updateAttributes(blockType, { lineHeight: e.target.value || null }).run();
        }}
      >
        <option value="">{t('formattingToolbar.defaultLineHeight')}</option>
        {LINE_HEIGHTS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
};

const ToggleButton: React.FC<{ active: boolean; onClick: () => void; label: string; children: React.ReactNode }> = ({
  active,
  onClick,
  label,
  children,
}) => (
  <button
    type="button"
    className={`${styles.toggle} ${active ? styles.toggleActive : ''}`}
    aria-pressed={active}
    aria-label={label}
    // Prevent the editor selection from being lost to a default mousedown
    // focus change before the click handler (and its `.focus()` chain) runs.
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);
