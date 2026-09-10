import { useCallback, useRef } from 'react';

/** Which edges/corners a resize handle moves. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface ResizeState {
  pointerId: number;
  handle: ResizeHandle;
  startClientX: number;
  startClientY: number;
}

export interface ResizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pointer-driven resize from any of the 8 handles (§4 Section Resizing, §10
 * Resizable Input Fields both ask for edges AND corners).
 *
 * `getStartBox` is read fresh at drag start rather than closed over, so a
 * resize always starts from whatever the box actually is at that instant —
 * important because the same element can be moved, then immediately resized,
 * within one render cycle.
 */
export interface ResizeOptions {
  minSize?: number;
  /**
   * Whether a CORNER drag should preserve the object's proportions.
   *
   * True for pictures, where a free corner drag stretches the image and the
   * distortion is baked into the document — there is no way to get the
   * original shape back except by remembering the numbers. Word and Docs both
   * lock a picture's corners for exactly this reason, and both let Shift
   * reverse whatever the default is, so a deliberate stretch is still one
   * modifier away.
   *
   * Side handles are never constrained, in either mode: a side drag means
   * "change this one dimension", and answering it by moving the other edge as
   * well is not what the handle looks like it does.
   */
  lockAspect?: boolean;
}

const CORNERS: ResizeHandle[] = ['ne', 'nw', 'se', 'sw'];

export const useResize = (
  getStartBox: () => ResizedBox,
  onResize: (box: ResizedBox) => void,
  getScale: () => number,
  options: ResizeOptions = {}
) => {
  const { minSize = 20, lockAspect = false } = options;
  const state = useRef<(ResizeState & { start: ResizedBox }) | null>(null);

  const beginResize = useCallback(
    (handle: ResizeHandle) => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      state.current = {
        pointerId: event.pointerId,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        start: getStartBox(),
      };
    },
    [getStartBox]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const s = state.current;
      if (!s || event.pointerId !== s.pointerId) return;
      const scale = getScale() || 1;
      const dx = (event.clientX - s.startClientX) / scale;
      const dy = (event.clientY - s.startClientY) / scale;

      let { x, y, width, height } = s.start;

      if (s.handle.includes('e')) width = s.start.width + dx;
      if (s.handle.includes('s')) height = s.start.height + dy;
      if (s.handle.includes('w')) {
        width = s.start.width - dx;
        x = s.start.x + dx;
      }
      if (s.handle.includes('n')) {
        height = s.start.height - dy;
        y = s.start.y + dy;
      }

      /*
       * PROPORTIONS, ON CORNERS ONLY. Shift reverses the default either way:
       * held over a picture it frees the corner for a deliberate stretch, held
       * over anything else it constrains one.
       *
       * The axis that moved further drives, so the box follows whichever way
       * the pointer is actually going rather than always tracking x — dragging
       * a corner mostly upward should resize mostly by height.
       */
      const constrain =
        CORNERS.includes(s.handle) && lockAspect !== event.shiftKey && s.start.height > 0;

      if (constrain) {
        const ratio = s.start.width / s.start.height;
        if (Math.abs(width - s.start.width) >= Math.abs(height - s.start.height)) {
          height = width / ratio;
        } else {
          width = height * ratio;
        }

        /*
         * THE FLOOR HAS TO BE IN PROPORTION TOO, or the clamp undoes the
         * constraint it was just given. The smallest box of this shape with
         * both sides at or above the minimum is the minimum on the SHORTER
         * side, scaled up on the longer one — clamping each axis to `minSize`
         * independently would square the box off instead (a 2:1 picture
         * dragged inside-out came out 20x20).
         *
         * Stated as an absolute rather than as a factor because the raw size
         * here can be zero or negative: the pointer is past the anchored edge,
         * and there is no factor that scales a negative width back into range.
         */
        const minWidth = Math.max(minSize, minSize * ratio);
        const minHeight = minWidth / ratio;
        if (width < minWidth || height < minHeight) {
          width = minWidth;
          height = minHeight;
        }

        // A west or north handle anchors the OPPOSITE edge, so the origin
        // follows the size the ratio settled on, not the raw pointer delta.
        if (s.handle.includes('w')) x = s.start.x + s.start.width - width;
        if (s.handle.includes('n')) y = s.start.y + s.start.height - height;
      } else {
        // Clamp width/height to the minimum WITHOUT letting x/y run away: if
        // the pointer overshoots past the minimum, the edge being dragged
        // simply stops at minSize rather than the box flipping inside-out.
        if (width < minSize) {
          if (s.handle.includes('w')) x = s.start.x + s.start.width - minSize;
          width = minSize;
        }
        if (height < minSize) {
          if (s.handle.includes('n')) y = s.start.y + s.start.height - minSize;
          height = minSize;
        }
      }

      onResize({ x, y, width, height });
    },
    [onResize, getScale, minSize, lockAspect]
  );

  const endResize = useCallback((event: React.PointerEvent) => {
    if (state.current) {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    }
    state.current = null;
  }, []);

  return { beginResize, onPointerMove, onPointerUp: endResize, onPointerCancel: endResize };
};

export const RESIZE_HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
