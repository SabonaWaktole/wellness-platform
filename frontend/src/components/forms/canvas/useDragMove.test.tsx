// @ts-nocheck
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDragMove } from './useDragMove';

/**
 * A minimal harness so the hook can be driven with real pointer events —
 * its logic only reads `event.clientX/clientY`, so it doesn't need real
 * hit-testing or layout geometry to exercise.
 */
const Harness: React.FC<{
  start: { x: number; y: number };
  onMove: (x: number, y: number) => void;
}> = ({ start, onMove }) => {
  const drag = useDragMove(() => start, onMove, () => 1);
  return (
    <div
      data-testid="handle"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    />
  );
};

const pointerEvent = (clientX: number, clientY: number, pointerId = 1) => ({
  pointerId,
  clientX,
  clientY,
  button: 0,
});

describe('useDragMove', () => {
  /*
   * THE BUG. The previous version reported a delta cumulative from drag
   * start, and both callers (CanvasElement, CanvasSection) added it to the
   * box's CURRENT position — which the previous pointermove had already
   * updated. Every event therefore double-applied the offset, so the element
   * accelerated away from the cursor and off the page instead of tracking it.
   * This asserts the fix: position tracks the cursor 1:1 across MANY move
   * events, not just one.
   */
  it('tracks the cursor 1:1 across repeated pointer moves, without runaway acceleration', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 100, y: 50 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(200, 200));
    fireEvent.pointerMove(handle, pointerEvent(210, 205)); // +10, +5
    fireEvent.pointerMove(handle, pointerEvent(220, 210)); // +20, +10
    fireEvent.pointerMove(handle, pointerEvent(230, 215)); // +30, +15

    expect(onMove.mock.calls).toEqual([
      [110, 55],
      [120, 60],
      [130, 65],
    ]);
  });

  it('stops reporting moves after pointer up', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 0, y: 0 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(0, 0));
    fireEvent.pointerMove(handle, pointerEvent(10, 10));
    fireEvent.pointerUp(handle, pointerEvent(10, 10));
    fireEvent.pointerMove(handle, pointerEvent(50, 50));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(10, 10);
  });

  it('ignores a move from a different (unrelated) pointer id', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 0, y: 0 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(0, 0, 1));
    fireEvent.pointerMove(handle, pointerEvent(30, 30, 2)); // different pointerId

    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores a non-primary button, so a right-click cannot start a drag', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 0, y: 0 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0, button: 2 });
    fireEvent.pointerMove(handle, pointerEvent(30, 30));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('divides the delta by scale, for a zoomed canvas', () => {
    const onMove = vi.fn();
    const ZoomedHarness = (props: { onMove: (x: number, y: number) => void }) => {
      const drag = useDragMove(() => ({ x: 0, y: 0 }), props.onMove, () => 2);
      return (
        <div
          data-testid="handle"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
        />
      );
    };
    const { getByTestId } = render(React.createElement(ZoomedHarness, { onMove }));
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(0, 0));
    fireEvent.pointerMove(handle, pointerEvent(20, 10)); // /2 scale

    expect(onMove).toHaveBeenCalledWith(10, 5);
  });

  /*
   * A CLICK IS NOT A DRAG. With no threshold the first `pointermove` reported
   * a new position however small it was, so a press with any tremor in it ran
   * the overflow ladder, marked the document dirty and armed a save — a form
   * could be modified by being clicked on.
   */
  it('ignores movement too small to be a drag', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 0, y: 0 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(100, 100));
    fireEvent.pointerMove(handle, pointerEvent(102, 101));

    expect(onMove).not.toHaveBeenCalled();
  });

  /* And once it IS a drag, the position is still measured from the press, so
   * crossing the threshold does not cost the pixels it took to get there. */
  it('reports from the original press once the threshold is crossed', () => {
    const onMove = vi.fn();
    const { getByTestId } = render(<Harness start={{ x: 0, y: 0 }} onMove={onMove} />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, pointerEvent(100, 100));
    fireEvent.pointerMove(handle, pointerEvent(102, 100));
    fireEvent.pointerMove(handle, pointerEvent(140, 100));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenLastCalledWith(40, 0);
  });
});
