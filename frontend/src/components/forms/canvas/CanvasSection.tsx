import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { useDragMove } from './useDragMove';
import { useResize, RESIZE_HANDLES, type ResizedBox } from './useResize';
import { isSyntheticSection } from './layoutOps';
import type { FormSection } from '../../../types/form';
import styles from './FormCanvas.module.css';

export interface CanvasSectionProps {
  section: FormSection;
  isSelected: boolean;
  /** True when this is the section "Add field"/"Add image" would target —
   *  either it's directly selected, or one of its own fields is. */
  isTarget: boolean;
  /** True while the owner has a caret in this section's heading (spec §7). */
  isEditingTitle: boolean;
  /** Live canvas zoom, so pointer deltas convert back to document space. */
  getScale: () => number;
  onSelect: (options?: { additive?: boolean }) => void;
  onBeginEditTitle: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (box: ResizedBox) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/**
 * Selection/drag/resize/rename chrome layered over one section's box.
 *
 * The section's actual visual appearance (border, background, its elements)
 * is drawn by `FormRenderer` underneath, at the identical coordinates — this
 * component only adds the builder-only affordances on top, so the canvas and
 * the real rendered form can never visually diverge.
 */
export const CanvasSection: React.FC<CanvasSectionProps> = ({
  section,
  isSelected,
  isTarget,
  isEditingTitle,
  getScale,
  onSelect,
  onBeginEditTitle,
  onMove,
  onResize,
  onRename,
  onDelete,
}) => {
  const { t } = useTranslation('settings');
  const synthetic = isSyntheticSection(section);

  const drag = useDragMove(() => ({ x: section.x, y: section.y }), onMove, getScale);
  const resize = useResize(
    () => ({ x: section.x, y: section.y, width: section.width, height: section.height }),
    onResize,
    getScale
  );

  const classes = [
    styles.sectionOverlay,
    isSelected ? styles.sectionSelected : '',
    !isSelected && isTarget ? styles.sectionActive : '',
    isEditingTitle ? styles.sectionEditing : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{ left: section.x, top: section.y, width: section.width, height: section.height }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ additive: e.shiftKey || e.ctrlKey || e.metaKey });
      }}
      onPointerMove={(e) => {
        drag.onPointerMove(e);
        resize.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        drag.onPointerUp(e);
        resize.onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        drag.onPointerCancel(e);
        resize.onPointerCancel(e);
      }}
    >
      {!synthetic && (
        <>
          {/*
            The heading band. Dragging it moves the section; double-clicking it
            opens the heading for typing — the same two gestures Word gives a
            text box, and the reason the title is no longer a permanently
            mounted input. That input used to sit on top of the real <h3>, so
            the FIRST click anywhere near a section landed in a text field
            instead of selecting the section.
          */}
          <div
            className={styles.sectionDragHandle}
            onPointerDown={drag.onPointerDown}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onBeginEditTitle();
            }}
            aria-hidden="true"
          />
          {isEditingTitle && (
            <input
              className={styles.sectionTitleInput}
              autoFocus
              value={section.title ?? ''}
              aria-label={t('formBuilder.sectionTitle')}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRename(e.target.value)}
            />
          )}
          <button
            type="button"
            className={styles.sectionDelete}
            aria-label={t('formBuilder.removeSection', { name: section.title ?? '' })}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} />
          </button>
          {isSelected &&
            RESIZE_HANDLES.map((handle) => (
              <div
                key={handle}
                className={`${styles.handle} ${styles[`handle-${handle}`]}`}
                onPointerDown={resize.beginResize(handle)}
              />
            ))}
        </>
      )}
    </div>
  );
};
