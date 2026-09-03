import { useCallback, useState } from 'react';
import type { FormPage } from '../../../types/form';

/**
 * Editor zoom and page-fit controls (spec §5).
 *
 * ZOOM IS A VIEWPORT CONCERN AND NOTHING ELSE. It is applied as a CSS
 * transform on the sheet stack and never touches document coordinates — spec
 * §5 ("Zoom affects only the viewport, never the document dimensions") and
 * §25 ("Treat document scaling as a viewport concern, not a data-model
 * change"). If zoom ever fed back into geometry, the same form would print
 * differently depending on what zoom the author happened to leave the editor
 * at, which is precisely the non-determinism the A4 model exists to remove.
 *
 * Drag and resize stay correct under zoom because `useDragMove`/`useResize`
 * already divide pointer deltas by a `getScale()` callback — wire `zoom` into
 * that and pointer math keeps working in document space.
 */

/** Discrete ladder rather than free-form: predictable, and matches what every
 *  document editor a business user has already used does. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Whitespace kept around the sheet so the page reads as a sheet of paper
 *  sitting on a desk (spec §5), not as the window background. */
export const CANVAS_GUTTER = 48;

const clamp = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export interface CanvasViewport {
  zoom: number;
  zoomPercent: number;
  /** Document geometry, ALWAYS unscaled — see the module note above. */
  pageWidth: number;
  pageHeight: number;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  fitWidth: (viewportWidth: number) => void;
  fitPage: (viewportWidth: number, viewportHeight: number) => void;
  /** For useDragMove/useResize, so pointer deltas stay in document space. */
  getScale: () => number;
}

export const useCanvasViewport = (page: FormPage): CanvasViewport => {
  const [zoom, setZoomState] = useState(1);

  const setZoom = useCallback((next: number) => setZoomState(clamp(next)), []);

  const zoomIn = useCallback(() => {
    setZoomState((z) => ZOOM_STEPS.find((s) => s > z + 1e-6) ?? MAX_ZOOM);
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((z) => [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? MIN_ZOOM);
  }, []);

  const fitWidth = useCallback(
    (viewportWidth: number) => {
      const usable = viewportWidth - CANVAS_GUTTER * 2;
      // A collapsed or not-yet-measured container must not produce a zero or
      // negative scale — that would render the document invisible and, worse,
      // make every pointer delta divide by ~0.
      if (!Number.isFinite(usable) || usable <= 0) return;
      setZoomState(clamp(usable / page.width));
    },
    [page.width]
  );

  const fitPage = useCallback(
    (viewportWidth: number, viewportHeight: number) => {
      const usableW = viewportWidth - CANVAS_GUTTER * 2;
      const usableH = viewportHeight - CANVAS_GUTTER * 2;
      if (!Number.isFinite(usableW) || !Number.isFinite(usableH) || usableW <= 0 || usableH <= 0) return;
      // Whichever axis binds first decides — that is what makes the WHOLE
      // page visible rather than just its width.
      setZoomState(clamp(Math.min(usableW / page.width, usableH / page.height)));
    },
    [page.width, page.height]
  );

  const getScale = useCallback(() => zoom, [zoom]);

  return {
    zoom,
    zoomPercent: Math.round(zoom * 100),
    pageWidth: page.width,
    pageHeight: page.height,
    zoomIn,
    zoomOut,
    setZoom,
    fitWidth,
    fitPage,
    getScale,
  };
};
