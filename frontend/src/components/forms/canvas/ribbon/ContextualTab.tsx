import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Trash2,
  CopyPlus,
  PenLine,
  SlidersHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Columns3,
  Rows3,
} from 'lucide-react';
import type { AlignMode } from '../snapping';
import { RibbonGroup } from './RibbonGroup';
import { RibbonButton } from './RibbonButton';
import { isDataBearing, type FormElement } from '../../../../types/form';
import type { ContextualTabId } from './ribbonTypes';

export interface ContextualTabProps {
  kind: ContextualTabId;
  element?: FormElement;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Puts the caret into the object's own text, where it has any. */
  onEditText?: () => void;
  onToggleFormatPane: () => void;
  isFormatPaneOpen: boolean;
  /** How many objects are selected — align needs two, distribute three. */
  selectionCount: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
}

/**
 * The tab that appears because of what is selected — Word's Picture Format,
 * Shape Format, Table Design.
 *
 * DIVISION OF LABOUR, and the reason this stays small: the contextual tab
 * carries VERBS (delete, duplicate, edit the text) and a way into the full
 * property set. The Format pane beside the page carries the properties
 * themselves. Without that line, a contextual tab grows into a second
 * properties panel and the user has two places to look for the same control —
 * which is the confusion this whole redesign is meant to remove.
 */
export const ContextualTab: React.FC<ContextualTabProps> = ({
  kind,
  element,
  onDelete,
  onDuplicate,
  onEditText,
  onToggleFormatPane,
  isFormatPaneOpen,
  selectionCount,
  onAlign,
  onDistribute,
}) => {
  const { t } = useTranslation('settings');

  const canEditText = !!onEditText && !!element && (element.type === 'TEXT' || isDataBearing(element.type));

  return (
    <>
      <RibbonGroup label={t(`formBuilder.ribbon.${kind}`)}>
        {canEditText && (
          <RibbonButton
            size="large"
            icon={<PenLine size={20} />}
            label={element?.type === 'TEXT' ? t('formBuilder.editOnPage') : t('formBuilder.editLabel')}
            onClick={onEditText!}
          />
        )}
        {/*
          A TOGGLE, NOT A ONE-WAY DOOR. This fired `setShowFormatPane(true)`
          and nothing ever fired false but the pane's own X, so pressing it
          while the pane was open did nothing at all and said nothing about
          why — and the Navigation pane button one tab away toggles properly.
        */}
        <RibbonButton
          icon={<SlidersHorizontal size={16} />}
          label={t('formBuilder.formatPane')}
          onClick={onToggleFormatPane}
          pressed={isFormatPaneOpen}
        />
      </RibbonGroup>

      {/*
        ALIGN AND DISTRIBUTE. `snapping.ts` has had both since the canvas was
        built, fully tested, with no caller — so a user could nudge two fields
        into rough alignment by eye but never actually align them. The
        thresholds match the functions' own guards (two to align, three to
        distribute), so the ribbon never offers a command that would be a no-op.
      */}
      <RibbonGroup label={t('formBuilder.ribbon.alignGroup')}>
        {(
          [
            ['left', AlignStartVertical],
            ['center-x', AlignCenterVertical],
            ['right', AlignEndVertical],
            ['top', AlignStartHorizontal],
            ['center-y', AlignCenterHorizontal],
            ['bottom', AlignEndHorizontal],
          ] as [AlignMode, typeof AlignStartVertical][]
        ).map(([mode, Icon]) => (
          <RibbonButton
            key={mode}
            icon={<Icon size={16} />}
            label={t(`formBuilder.align.${mode}`)}
            onClick={() => onAlign(mode)}
            disabled={selectionCount < 2}
          />
        ))}
        <RibbonButton
          icon={<Columns3 size={16} />}
          label={t('formBuilder.distributeHorizontally')}
          onClick={() => onDistribute('horizontal')}
          disabled={selectionCount < 3}
        />
        <RibbonButton
          icon={<Rows3 size={16} />}
          label={t('formBuilder.distributeVertically')}
          onClick={() => onDistribute('vertical')}
          disabled={selectionCount < 3}
        />
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.arrangeGroup')}>
        <RibbonButton icon={<CopyPlus size={16} />} label={t('formBuilder.duplicate')} onClick={onDuplicate} />
        <RibbonButton icon={<Trash2 size={16} />} label={t('formBuilder.deleteObject')} onClick={onDelete} />
      </RibbonGroup>
    </>
  );
};
