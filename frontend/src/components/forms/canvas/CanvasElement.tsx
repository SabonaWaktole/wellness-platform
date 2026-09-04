import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { useDragMove } from './useDragMove';
import { useResize, RESIZE_HANDLES, type ResizedBox } from './useResize';
import type { FormElement } from '../../../types/form';
import styles from './FormCanvas.module.css';

export interface CanvasElementProps {
  element: FormElement;
  isSelected: boolean;
  /** Live canvas zoom, so pointer deltas convert back to document space. */
  getScale: () => number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (box: ResizedBox) => void;
  onDelete: () => void;
}

/**
 * Selection/drag/resize chrome for one element (field, image or text),
 * layered over its box exactly as `CanvasSection` layers over a section.
 *
 * Deliberately opaque to pointer events for its whole area, including over
 * whatever `FormRenderer` draws underneath (a real, focusable input for a
 * FIELD element) — the builder is a design surface, not a data-entry form,
 * so a click here always means "select this", never "type into this".
 */
export const CanvasElement: React.FC<CanvasElementProps> = ({
  element,
  isSelected,
  getScale,
  onSelect,
  onMove,
  onResize,
  onDelete,
}) => {
  const { t } = useTranslation('settings');

  const drag = useDragMove(() => ({ x: element.x, y: element.y }), onMove, getScale);
  const resize = useResize(
    () => ({ x: element.x, y: element.y, width: element.width, height: element.height }),
    onResize,
    getScale
  );

  const classes = [styles.elementOverlay, isSelected ? styles.elementSelected : ''].filter(Boolean).join(' ');
  const label = elementLabel(element);

  return (
    <div
      className={classes}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={drag.onPointerDown}
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
      {isSelected && (
        <>
          <button
            type="button"
            className={styles.elementDelete}
            aria-label={t('formBuilder.removeItem', { name: label })}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={12} />
          </button>
          {RESIZE_HANDLES.map((handle) => (
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

const elementLabel = (element: FormElement): string => {
  if (element.field) return element.field.label || element.field.key;
  if (element.type === 'TEXT') return 'Text';
  if (element.type === 'DIVIDER') return 'Divider';
  return 'Image';
};
