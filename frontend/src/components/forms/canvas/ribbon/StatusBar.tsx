import React from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, Maximize2, MoveHorizontal, Check } from 'lucide-react';
import { DropdownMenu } from '../../../ui/DropdownMenu';
import type { DropdownMenuItemType } from '../../../ui/DropdownMenu/DropdownMenu';
import { ZOOM_STEPS } from '../useCanvasViewport';
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
  onSetZoom: (zoom: number) => void;
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
  onSetZoom,
  onFitPage,
  onFitWidth,
}) => {
  const { t } = useTranslation('settings');

  /*
   * THE PERCENTAGE IS THE CONTROL.
   *
   * `ZOOM_STEPS` and `setZoom` have existed since the canvas was built with no
   * caller anywhere: the only way to change zoom was to press `+` repeatedly,
   * and the number itself was inert text sitting between the two steppers. In
   * Word and in Docs the number is the thing you click, and it opens the list
   * of levels — which is also where "fit the page" and "fit the width" live,
   * because they are answers to the same question.
   *
   * Those two were icon-only buttons here. Moving them into the menu is what
   * lets the status bar shrink to what it is for — a reading of the current
   * state with one way in — rather than five controls in a row.
   */
  const zoomItems: DropdownMenuItemType[] = [
    ...ZOOM_STEPS.map((step) => {
      const percent = Math.round(step * 100);
      return {
        id: `zoom-${percent}`,
        label: `${percent}%`,
        // A tick against the level in force, so the menu says where you are as
        // well as where you can go.
        icon: percent === zoomPercent ? <Check size={14} /> : <span className={styles.zoomTickSpacer} />,
        onClick: () => onSetZoom(step),
      };
    }),
    {
      id: 'fit-page',
      label: t('formBuilder.fitPage'),
      icon: <Maximize2 size={14} />,
      onClick: onFitPage,
    },
    {
      id: 'fit-width',
      label: t('formBuilder.fitWidth'),
      icon: <MoveHorizontal size={14} />,
      onClick: onFitWidth,
    },
  ];

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
        <DropdownMenu
          align="right"
          items={zoomItems}
          trigger={
            <button
              type="button"
              className={styles.zoomPercent}
              aria-label={t('formBuilder.zoomLevel')}
              title={t('formBuilder.zoomLevel')}
            >
              {zoomPercent}%
            </button>
          }
        />
        <button
          type="button"
          onClick={onZoomIn}
          disabled={!canZoomIn}
          aria-label={t('formBuilder.zoomIn')}
          title={t('formBuilder.zoomIn')}
        >
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  );
};
