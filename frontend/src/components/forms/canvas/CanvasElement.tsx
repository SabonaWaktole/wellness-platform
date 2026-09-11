import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { useDragMove } from './useDragMove';
import { useResize, RESIZE_HANDLES, type ResizedBox } from './useResize';
import { defaultTargetFor, type EditTarget } from './useInlineEditing';
import { componentFor } from '../registry/componentRegistry';
import type { FormElement } from '../../../types/form';
import styles from './FormCanvas.module.css';

export interface CanvasElementProps {
  element: FormElement;
  isSelected: boolean;
  /** True while the owner has a caret inside this element (spec §7). */
  isEditing: boolean;
  /** Live canvas zoom, so pointer deltas convert back to document space. */
  getScale: () => number;
  onSelect: (options?: { additive?: boolean }) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onBeginEdit: (target: EditTarget) => void;
  onMove: (x: number, y: number) => void;
  onResize: (box: ResizedBox) => void;
  onDelete: () => void;
  /** Commits an inline label edit. */
  onRenameField: (label: string) => void;
}

/**
 * Selection, drag and resize chrome for one element — and the gate between
 * OBJECT MANIPULATION and TEXT EDITING (spec §7, §9).
 *
 * A click selects the object; a double-click opens the text inside it. That
 * split is what stops the builder feeling like a graphics tool: the owner is
 * not fighting a bounding box every time they want to fix a typo.
 *
 * WHY THE HANDLERS ARE UNBOUND RATHER THAN JUST POINTER-DISABLED while
 * editing: `useDragMove.onPointerDown` calls `setPointerCapture`, which
 * retargets every later pointer event to this overlay no matter where the
 * pointer actually is. With capture held, a caret could never be moved inside
 * the editor underneath. `pointer-events: none` alone would not undo a capture
 * already taken, so the gesture handlers are removed from the tree outright
 * for the duration of the edit.
 *
 * The element still renders its own content through `FormPageRenderer`
 * underneath; this component draws only the chrome on top, at identical
 * coordinates.
 */
export const CanvasElement: React.FC<CanvasElementProps> = ({
  element,
  isSelected,
  isEditing,
  getScale,
  onSelect,
  onContextMenu,
  onBeginEdit,
  onMove,
  onResize,
  onDelete,
  onRenameField,
}) => {
  const { t } = useTranslation('settings');
  // Component type names live in the `forms` namespace alongside the registry
  // they describe, so an element with no label of its own is still announced
  // as "Text block" rather than as a raw type key.
  const { t: tForms } = useTranslation('forms');
  const definition = componentFor(element.type);
  const label =
    element.field?.label ||
    element.field?.key ||
    (definition ? tForms(definition.labelKey) : element.type);

  const drag = useDragMove(() => ({ x: element.x, y: element.y }), onMove, getScale);
  const resize = useResize(
    () => ({ x: element.x, y: element.y, width: element.width, height: element.height }),
    onResize,
    getScale,
    // A picture's corners keep its proportions unless Shift says otherwise —
    // a stretched image cannot be un-stretched by eye afterwards.
    { lockAspect: element.type === 'IMAGE' }
  );

  const editTarget = defaultTargetFor(element);
  const editingLabel = isEditing && editTarget?.kind === 'field-label';

  const classes = [
    styles.elementOverlay,
    // Not while typing: the selection outline is about an OBJECT, and during
    // an edit the thing in hand is text. See `.elementEditing`.
    isSelected && !isEditing ? styles.elementSelected : '',
    isEditing ? styles.elementEditing : '',
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * Gesture handlers exist only outside an edit session — see the note above
   * on pointer capture. Selection is likewise suppressed: a click inside the
   * caret is a caret move, not a re-selection of the object it sits in.
   */
  const gestures = isEditing
    ? {}
    : {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          // The release that ends a drag is followed by a click. Selecting on
          // it would collapse a multi-selection to whichever member was being
          // dragged — the arrangement the user had just finished making.
          if (drag.didDrag()) return;
          onSelect({ additive: e.shiftKey || e.ctrlKey || e.metaKey });
        },
        onDoubleClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (editTarget) onBeginEdit(editTarget);
        },
        // While a caret is open the browser's own menu wins — spell-check and
        // paste belong to the text, not to the object around it. That falls
        // out of `gestures` being empty in the editing state.
        onContextMenu,
        onPointerDown: drag.onPointerDown,
        onPointerMove: (e: React.PointerEvent) => {
          drag.onPointerMove(e);
          resize.onPointerMove(e);
        },
        onPointerUp: (e: React.PointerEvent) => {
          drag.onPointerUp(e);
          resize.onPointerUp(e);
        },
        onPointerCancel: (e: React.PointerEvent) => {
          drag.onPointerCancel(e);
          resize.onPointerCancel(e);
        },
      };

  return (
    <div
      className={classes}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
      {...gestures}
    >
      {/*
        A field's LABEL is the piece of it the owner writes; the input below is
        the client's to fill. Editing the label in place — rather than only in
        a side panel — is what makes a form field feel like part of the
        document instead of a configuration record.
      */}
      {editingLabel && (
        <input
          className={styles.labelInput}
          autoFocus
          /* Marks this as the caret's own surface, so the sheet underneath
             does not answer a click meant for the text (see FormCanvas's
             `isInsideCaret`). */
          data-editing-surface="true"
          value={element.field?.label ?? ''}
          aria-label={t('formBuilder.label')}
          onChange={(e) => onRenameField(e.target.value)}
        />
      )}

      {isSelected && !isEditing && (
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
              data-handle={handle}
              onPointerDown={resize.beginResize(handle)}
            />
          ))}
        </>
      )}
    </div>
  );
};
