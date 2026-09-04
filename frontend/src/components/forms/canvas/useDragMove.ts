import { useCallback, useRef } from 'react';

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
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
export const useDragMove = (
  getStartPosition: () => { x: number; y: number },
  onMove: (x: number, y: number) => void,
  getScale: () => number
) => {
  const drag = useRef<DragState | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Only the primary button/touch starts a drag — a right-click or a
      // secondary touch point must not hijack an in-progress interaction.
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      const start = getStartPosition();
      drag.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: start.x,
        startY: start.y,
      };
    },
    [getStartPosition]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
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

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
};
