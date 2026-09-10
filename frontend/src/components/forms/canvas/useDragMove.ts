import { useCallback, useRef } from 'react';

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  /**
   * False until the pointer has travelled far enough to mean a drag. See
   * `DRAG_THRESHOLD`.
   */
  moved: boolean;
}

/**
 * Pointer-driven "move" for a section or element on the canvas.
 *
 * Follows the same shape as `ImageCropper`'s existing drag handling
 * (`setPointerCapture` + a ref-held origin, not React state, so a fast drag
 * never lags a render behind the pointer) rather than pulling in a
 * drag-and-drop library — free positioning is continuous pointer tracking,
 * not a sortable-list reorder, so a DnD library buys nothing here.
 *
 * `onMove` receives the ABSOLUTE new position, not a delta — and the delta is
 * always measured from the position at drag START (`getStartPosition`,
 * called once on pointer down), never from whatever the position happens to
 * be on the current render. That distinction is the whole fix for a bug where
 * the element accelerated away from the cursor and off the page: `onMove`
 * used to report a delta cumulative from drag start, and the caller added it
 * to the box's CURRENT (already-updated-by-the-previous-event) position —
 * double-applying the offset on every single pointermove. Mirrors
 * `useResize`, which captures its start box the same way for the same
 * reason.
 *
 * `scale` is the canvas's current zoom (from `ScaledPage`): pointer deltas
 * happen in screen pixels, but the layout stores page pixels, so every delta
 * is divided by scale before it reaches `onMove`.
 */
/**
 * How far the pointer must travel before a press becomes a drag, in screen
 * pixels.
 *
 * There was no threshold at all: the first `pointermove` reported a new
 * position however small, so a click with any hand tremor in it ran the whole
 * overflow ladder, marked the document dirty and scheduled a save. A form
 * could be "modified" by being looked at. Three pixels is below the level a
 * deliberate drag ever starts at and above the level a click ever reaches.
 *
 * Measured in SCREEN pixels deliberately — it is a fact about hands, not about
 * the document, so it must not shrink as the page is zoomed in.
 */
export const DRAG_THRESHOLD = 3;

export const useDragMove = (
  getStartPosition: () => { x: number; y: number },
  onMove: (x: number, y: number) => void,
  getScale: () => number
) => {
  const drag = useRef<DragState | null>(null);
  /*
   * Whether the LAST gesture was a real drag, readable after it has ended.
   *
   * A pointer release is followed by a `click`, and both canvas overlays
   * select on click — so finishing a drag re-selected the object that was
   * dragged, with `additive: false`, silently collapsing a multi-selection to
   * the one member the user happened to have hold of. Kept outside
   * `drag.current` because that is cleared on pointer up, which is before the
   * click this has to answer; reset on the next press.
   */
  const draggedRef = useRef(false);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Only the primary button/touch starts a drag — a right-click or a
      // secondary touch point must not hijack an in-progress interaction.
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      draggedRef.current = false;
      const start = getStartPosition();
      drag.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: start.x,
        startY: start.y,
        moved: false,
      };
    },
    [getStartPosition]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;

      if (!state.moved) {
        const travelled =
          Math.abs(event.clientX - state.startClientX) >= DRAG_THRESHOLD ||
          Math.abs(event.clientY - state.startClientY) >= DRAG_THRESHOLD;
        if (!travelled) return;
        state.moved = true;
        draggedRef.current = true;
      }

      const scale = getScale() || 1;
      const dx = (event.clientX - state.startClientX) / scale;
      const dy = (event.clientY - state.startClientY) / scale;
      onMove(state.startX + dx, state.startY + dy);
    },
    [onMove, getScale]
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (drag.current) {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    }
    drag.current = null;
  }, []);

  /** True when the click now arriving is the tail of a drag, not a selection. */
  const didDrag = useCallback(() => draggedRef.current, []);

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, didDrag };
};
