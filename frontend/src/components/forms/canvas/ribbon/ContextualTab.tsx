import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, CopyPlus, PenLine, SlidersHorizontal } from 'lucide-react';
import { RibbonGroup } from './RibbonGroup';
import { RibbonButton } from './RibbonButton';
import { isDataBearing, type FormElement, type FormSection } from '../../../../types/form';
import type { ContextualTabId } from './ribbonTypes';

export interface ContextualTabProps {
  kind: ContextualTabId;
  element?: FormElement;
  section?: FormSection;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Puts the caret into the object's own text, where it has any. */
  onEditText?: () => void;
  onOpenFormatPane: () => void;
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
  onOpenFormatPane,
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
        <RibbonButton
          icon={<SlidersHorizontal size={16} />}
          label={t('formBuilder.formatPane')}
          onClick={onOpenFormatPane}
        />
      </RibbonGroup>

      <RibbonGroup label={t('formBuilder.ribbon.arrangeGroup')}>
        <RibbonButton icon={<CopyPlus size={16} />} label={t('formBuilder.duplicate')} onClick={onDuplicate} />
        <RibbonButton icon={<Trash2 size={16} />} label={t('formBuilder.deleteObject')} onClick={onDelete} />
      </RibbonGroup>
    </>
  );
};
