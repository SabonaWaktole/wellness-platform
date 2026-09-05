import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Printer,
  Eye,
  History,
  Link as LinkIcon,
  Save,
  UploadCloud,
  ChevronDown,
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button } from '../../../ui/Button/Button';
import { DropdownMenu, type DropdownMenuItemType } from '../../../ui/DropdownMenu/DropdownMenu';
import type { FormStatus } from '../../../../types/form';
import styles from './Ribbon.module.css';

export interface TitleBarProps {
  formName: string;
  status: FormStatus;
  hasUnpublishedChanges: boolean;
  onBack: () => void;
  /** Absent unless the form is published with a share token. */
  onCopyLink?: () => void;
  onPrint: () => void;
  onToggleReadView: () => void;
  isReadView: boolean;
  onToggleHistory: () => void;
  isHistory: boolean;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onPublish: () => void;
  isPublishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The bar above the ribbon: where the document is, and what can be done TO it
 * as a whole.
 *
 * The split between this and the ribbon is Word's, and it is a real one — the
 * ribbon holds commands that change the document's CONTENT, the title bar
 * holds the ones that act on the document as an artefact: name it, go back
 * from it, save it, publish it, print it, look at its history. Save and
 * Publish stay out here rather than becoming ribbon buttons because they are
 * the two commitments the owner makes, and they should not move when the tab
 * changes.
 */
export const TitleBar: React.FC<TitleBarProps> = ({
  formName,
  status,
  hasUnpublishedChanges,
  onBack,
  onCopyLink,
  onPrint,
  onToggleReadView,
  isReadView,
  onToggleHistory,
  isHistory,
  onSave,
  isSaving,
  isDirty,
  onPublish,
  isPublishing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const { t } = useTranslation('settings');

  /*
   * File collects the document-level commands that used to sit in the toolbar
   * competing with the editing controls. Word puts all four behind File for
   * the same reason: they are things done once in a session, not things
   * reached for while laying out a page.
   */
  const fileItems: DropdownMenuItemType[] = [
    {
      id: 'print',
      label: t('formBuilder.print'),
      icon: <Printer size={15} />,
      onClick: onPrint,
    },
    {
      id: 'read-view',
      label: isReadView ? t('formBuilder.hidePreview') : t('formBuilder.readView'),
      icon: <Eye size={15} />,
      onClick: onToggleReadView,
    },
    {
      id: 'history',
      label: isHistory ? t('formBuilder.hideHistory') : t('formBuilder.versionHistory'),
      icon: <History size={15} />,
      onClick: onToggleHistory,
    },
    ...(onCopyLink
      ? [
          {
            id: 'copy-link',
            label: t('formBuilder.copyLink'),
            icon: <LinkIcon size={15} />,
            onClick: onCopyLink,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.titleBar}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeft size={16} />
        {t('formBuilder.back')}
      </button>

      <DropdownMenu
        align="left"
        trigger={
          <button type="button" className={styles.fileButton}>
            {t('formBuilder.file')}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        }
        items={fileItems}
      />

      {/*
        QUICK ACCESS. Undo and redo sit here rather than on the Home tab for
        the same reason Word puts them on the quick access toolbar: they are
        needed from whichever tab you happen to be on, and an undo you have to
        change tabs to reach is an undo you will not use.
      */}
      <div className={styles.quickAccess} role="group" aria-label={t('formBuilder.ribbon.undoGroup')}>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('formBuilder.undo')}
          title={t('formBuilder.undo')}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t('formBuilder.redo')}
          title={t('formBuilder.redo')}
        >
          <Redo2 size={15} />
        </button>
      </div>

      <div className={styles.titleCentre}>
        <span className={styles.formName}>{formName}</span>
        <span
          className={`${styles.statusBadge} ${
            status === 'PUBLISHED' ? styles.statusBadgePublished : styles.statusBadgeDraft
          }`}
        >
          {status === 'PUBLISHED' ? t('formBuilder.published') : t('formBuilder.draft')}
        </span>
        {status === 'PUBLISHED' && hasUnpublishedChanges && (
          <span className={styles.unpublishedHint}>{t('formBuilder.unpublishedChanges')}</span>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        type="button"
        icon={<Save size={15} />}
        disabled={isSaving || !isDirty}
        onClick={onSave}
      >
        {isSaving ? t('formBuilder.saving') : t('formBuilder.save')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        type="button"
        icon={<UploadCloud size={15} />}
        disabled={isPublishing || isSaving}
        onClick={onPublish}
      >
        {isPublishing ? t('formBuilder.publishing') : t('formBuilder.publish')}
      </Button>
    </div>
  );
};
