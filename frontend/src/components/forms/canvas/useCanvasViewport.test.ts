import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasViewport, ZOOM_STEPS, MIN_ZOOM, MAX_ZOOM } from './useCanvasViewport';
import { A4_PORTRAIT, emptyPageGeometry } from '../../../types/form';

const page = emptyPageGeometry();

describe('useCanvasViewport', () => {
  it('starts at 100%', () => {
    const { result } = renderHook(() => useCanvasViewport(page));
    expect(result.current.zoom).toBe(1);
    expect(result.current.zoomPercent).toBe(100);
  });

  it('zoomIn / zoomOut step through the preset ladder, not free-form', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => result.current.zoomIn());
    expect(ZOOM_STEPS).toContain(result.current.zoom);
    expect(result.current.zoom).toBeGreaterThan(1);

    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBe(1);
  });

  it('clamps at the ends of the ladder instead of running off it', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => { for (let i = 0; i < 40; i += 1) result.current.zoomOut(); });
    expect(result.current.zoom).toBe(MIN_ZOOM);

    act(() => { for (let i = 0; i < 80; i += 1) result.current.zoomIn(); });
    expect(result.current.zoom).toBe(MAX_ZOOM);
  });

  it('fitWidth scales so the page width fills the viewport, minus gutters', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => result.current.fitWidth(A4_PORTRAIT.width * 2));
    // Twice the page width available -> roughly 2x, allowing for the gutter.
    expect(result.current.zoom).toBeGreaterThan(1.5);
    expect(result.current.zoom).toBeLessThanOrEqual(2);
  });

  it('fitPage uses whichever axis is the binding constraint', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    // Wide but short viewport: HEIGHT binds, so zoom must respect it.
    act(() => result.current.fitPage(A4_PORTRAIT.width * 4, A4_PORTRAIT.height));
    expect(result.current.zoom).toBeLessThanOrEqual(1);
  });

  it('never returns a zero or negative scale for a degenerate viewport', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => result.current.fitPage(0, 0));
    expect(result.current.zoom).toBeGreaterThan(0);

    act(() => result.current.fitWidth(-500));
    expect(result.current.zoom).toBeGreaterThan(0);
  });

  /*
   * Spec §5/§25: zoom is a VIEWPORT concern. It must never feed back into
   * document coordinates, or the same form would print differently depending
   * on what zoom the author happened to leave the editor at.
   */
  it('exposes the page geometry unchanged at every zoom level', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());

    expect(result.current.pageWidth).toBe(A4_PORTRAIT.width);
    expect(result.current.pageHeight).toBe(A4_PORTRAIT.height);
  });

  it('setZoom snaps an arbitrary value into the allowed range', () => {
    const { result } = renderHook(() => useCanvasViewport(page));

    act(() => result.current.setZoom(99));
    expect(result.current.zoom).toBe(MAX_ZOOM);

    act(() => result.current.setZoom(0.001));
    expect(result.current.zoom).toBe(MIN_ZOOM);
  });
});
