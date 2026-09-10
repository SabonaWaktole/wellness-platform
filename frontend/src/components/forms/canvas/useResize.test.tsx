// @ts-nocheck
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useResize } from './useResize';

/**
 * Drives the hook with real pointer events. It reads only
 * `event.clientX/clientY/shiftKey`, so no layout or hit-testing is needed.
 */
const Harness: React.FC<{
  start: { x: number; y: number; width: number; height: number };
  onResize: (box: { x: number; y: number; width: number; height: number }) => void;
  lockAspect?: boolean;
  handle?: string;
}> = ({ start, onResize, lockAspect, handle = 'se' }) => {
  const resize = useResize(() => start, onResize, () => 1, { lockAspect });
  return (
    <div
      data-testid="handle"
      onPointerDown={resize.beginResize(handle)}
      onPointerMove={resize.onPointerMove}
      onPointerUp={resize.onPointerUp}
    />
  );
};

const ev = (clientX: number, clientY: number, extra = {}) => ({
  pointerId: 1,
  button: 0,
  clientX,
  clientY,
  ...extra,
});

/** A 200x100 box — a 2:1 ratio, so a broken constraint is obvious. */
const START = { x: 0, y: 0, width: 200, height: 100 };

const dragTo = (handle: HTMLElement, x: number, y: number, extra = {}) => {
  fireEvent.pointerDown(handle, ev(0, 0));
  fireEvent.pointerMove(handle, ev(x, y, extra));
};

describe('useResize', () => {
  /*
   * A PICTURE STRETCHED BY A CORNER CANNOT BE UN-STRETCHED BY EYE. Word and
   * Docs both constrain a picture's corners for that reason; nothing here did,
   * and the distortion went straight into the stored geometry.
   */
  it('keeps a locked corner in proportion', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(
      <Harness start={START} onResize={onResize} lockAspect />
    );

    // Pull the corner 100 right and only 5 down — a free resize would give
    // 300x105 and flatten the picture.
    dragTo(getByTestId('handle'), 100, 5);

    const box = onResize.mock.calls.at(-1)[0];
    expect(box.width / box.height).toBeCloseTo(2, 5);
    expect(box.width).toBeCloseTo(300, 5);
  });

  /* Shift reverses whatever the default is, so a deliberate stretch stays one
   * modifier away. */
  it('frees a locked corner while Shift is held', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(
      <Harness start={START} onResize={onResize} lockAspect />
    );

    dragTo(getByTestId('handle'), 100, 5, { shiftKey: true });

    expect(onResize.mock.calls.at(-1)[0]).toMatchObject({ width: 300, height: 105 });
  });

  /* And constrains an unlocked one, which is what Shift means for a shape. */
  it('constrains an unlocked corner while Shift is held', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(<Harness start={START} onResize={onResize} />);

    dragTo(getByTestId('handle'), 100, 5, { shiftKey: true });

    const box = onResize.mock.calls.at(-1)[0];
    expect(box.width / box.height).toBeCloseTo(2, 5);
  });

  /*
   * Side handles are never constrained, in either mode: a side drag means
   * "change this one dimension", and moving the other edge too is not what the
   * handle looks like it does.
   */
  it('leaves a side handle unconstrained even when locked', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(
      <Harness start={START} onResize={onResize} lockAspect handle="e" />
    );

    dragTo(getByTestId('handle'), 100, 0);

    expect(onResize.mock.calls.at(-1)[0]).toMatchObject({ width: 300, height: 100 });
  });

  /* A west handle anchors the opposite edge, so the origin has to follow the
   * size the ratio settled on rather than the raw pointer delta. */
  it('re-derives the origin for a locked north-west corner', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(
      <Harness start={{ x: 100, y: 50, width: 200, height: 100 }} onResize={onResize} lockAspect handle="nw" />
    );

    dragTo(getByTestId('handle'), -100, -5);

    const box = onResize.mock.calls.at(-1)[0];
    expect(box.width / box.height).toBeCloseTo(2, 5);
    // The bottom-right corner is the anchor and must not have moved.
    expect(box.x + box.width).toBeCloseTo(300, 5);
    expect(box.y + box.height).toBeCloseTo(150, 5);
  });

  /* The minimum floor must not undo the proportions it was just given. */
  it('holds the ratio when a locked corner is dragged past the minimum', () => {
    const onResize = vi.fn();
    const { getByTestId } = render(
      <Harness start={START} onResize={onResize} lockAspect />
    );

    dragTo(getByTestId('handle'), -1000, -1000);

    const box = onResize.mock.calls.at(-1)[0];
    expect(box.width / box.height).toBeCloseTo(2, 5);
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(20);
  });
});
