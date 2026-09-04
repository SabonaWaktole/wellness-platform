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
export const useResize = (
  getStartBox: () => ResizedBox,
  onResize: (box: ResizedBox) => void,
  getScale: () => number,
  minSize = 20
) => {
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

      // Clamp width/height to the minimum WITHOUT letting x/y run away: if the
      // pointer overshoots past the minimum, the edge being dragged simply
      // stops at minSize rather than the box flipping inside-out.
      if (width < minSize) {
        if (s.handle.includes('w')) x = s.start.x + s.start.width - minSize;
        width = minSize;
      }
      if (height < minSize) {
        if (s.handle.includes('n')) y = s.start.y + s.start.height - minSize;
        height = minSize;
      }

      onResize({ x, y, width, height });
    },
    [onResize, getScale, minSize]
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
