import React from 'react';
import { useTranslation } from 'react-i18next';
import { Scissors, Copy, ClipboardPaste, CopyPlus, MousePointerSquareDashed } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { RibbonGroup } from './RibbonGroup';
import { RibbonButton } from './RibbonButton';
import { FormattingToolbar } from '../../registry/FormattingToolbar';
import styles from './Ribbon.module.css';

export interface HomeTabProps {
  canCut: boolean;
  canPaste: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  /** Whichever on-page editor currently holds the caret, if any. */
  editor: Editor | null;
}

/**
 * Home: the things done to what is already in the document — the clipboard,
 * and text formatting.
 *
 * The clipboard verbs had no UI at all before this; they existed only as
 * Ctrl+X/C/V/D in `keyboard.ts`, which is precisely the kind of
 * discoverability gap a ribbon is for. Undo and redo are deliberately NOT
 * here — they live in the title bar's quick access cluster, reachable from
 * whichever tab happens to be open.
 *
 * The formatting controls are `FormattingToolbar` unchanged: the same
 * component, moved out of the sidebar to where Word users look for it, and
 * greyed rather than hidden when there is no text to apply it to.
 */
export const HomeTab: React.FC<HomeTabProps> = ({
  canCut,
  canPaste,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onSelectAll,
  editor,
}) => {
  const { t } = useTranslation('settings');

  return (
    <>
      <RibbonGroup label={t('formBuilder.ribbon.clipboardGroup')}>
        <RibbonButton
          size="large"
          icon={<ClipboardPaste size={20} />}
          label={t('formBuilder.paste')}
          onClick={onPaste}
          disabled={!canPaste}
        />
        <RibbonButton icon={<Scissors size={16} />} label={t('formBuilder.cut')} onClick={onCut} disabled={!canCut} />
        <RibbonButton icon={<Copy size={16} />} label={t('formBuilder.copy')} onClick={onCopy} disabled={!canCut} />
        <RibbonButton
          icon={<CopyPlus size={16} />}
          label={t('formBuilder.duplicate')}
          onClick={onDuplicate}
          disabled={!canCut}
        />
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.fontGroup')}>
        <div className={styles.formatting}>
          <FormattingToolbar editor={editor} showWhenInactive />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.editingGroup')}>
        <RibbonButton
          icon={<MousePointerSquareDashed size={16} />}
          label={t('formBuilder.selectAll')}
          onClick={onSelectAll}
        />
      </RibbonGroup>
    </>
  );
};
