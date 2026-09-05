import React from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, Maximize2, MoveHorizontal } from 'lucide-react';
import type { AutosaveStatus } from '../useAutosave';
import styles from './Ribbon.module.css';

export interface StatusBarProps {
  pageNumber: number;
  pageCount: number;
  autosave: AutosaveStatus;
  onRetrySave: () => void;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitPage: () => void;
  onFitWidth: () => void;
}

/**
 * The strip along the bottom: where you are in the document, whether the work
 * is safe, and how big it is being shown.
 *
 * All three used to be in the top toolbar, where they sat between commands and
 * were read as commands themselves. Word puts them here because they are
 * STATE, not actions — the page counter and the zoom control are the two
 * things a writer glances at without meaning to click, and moving them out of
 * the command surface is most of what makes the top of the window feel calm.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  pageNumber,
  pageCount,
  autosave,
  onRetrySave,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onFitPage,
  onFitWidth,
}) => {
  const { t } = useTranslation('settings');

  return (
    <div className={styles.statusBar}>
      <span className={styles.statusItem}>
        {t('formBuilder.pageOf', { number: pageNumber, count: pageCount })}
      </span>

      <span className={styles.statusItem}>
        {autosave === 'error' ? (
          <>
            {t('formBuilder.autosaveFailed')}{' '}
            <button type="button" className={styles.statusRetry} onClick={onRetrySave}>
              {t('formBuilder.retry')}
            </button>
          </>
        ) : autosave === 'saving' ? (
          t('formBuilder.saving')
        ) : autosave === 'saved' ? (
          t('formBuilder.saved')
        ) : autosave === 'pending' ? (
          t('formBuilder.unsavedChanges')
        ) : (
          ''
        )}
      </span>

      {/* Icon-only, so every one of these carries `title` as well as an
          `aria-label`: the label alone is invisible to the sighted user, who
          otherwise has no way at all to find out what the icon does (§34). */}
      <div className={styles.zoomCluster}>
        <button
          type="button"
          onClick={onZoomOut}
          disabled={!canZoomOut}
          aria-label={t('formBuilder.zoomOut')}
          title={t('formBuilder.zoomOut')}
        >
          <ZoomOut size={14} />
        </button>
        <span className={styles.zoomPercent}>{zoomPercent}%</span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={!canZoomIn}
          aria-label={t('formBuilder.zoomIn')}
          title={t('formBuilder.zoomIn')}
        >
          <ZoomIn size={14} />
        </button>
        <button type="button" onClick={onFitPage} aria-label={t('formBuilder.fitPage')} title={t('formBuilder.fitPage')}>
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          onClick={onFitWidth}
          aria-label={t('formBuilder.fitWidth')}
          title={t('formBuilder.fitWidth')}
        >
          <MoveHorizontal size={14} />
        </button>
      </div>
    </div>
  );
};
