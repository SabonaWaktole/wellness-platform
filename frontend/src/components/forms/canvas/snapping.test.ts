import { describe, it, expect } from 'vitest';
import { computeSnap, SNAP_THRESHOLD, GRID_SIZE, alignBoxes, distributeBoxes } from './snapping';

const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });

describe('computeSnap', () => {
  const siblings = [box(100, 100, 200, 60)];
  const bounds = { width: 600, height: 400 };

  it('snaps a left edge that is within the threshold', () => {
    const { x, guides } = computeSnap(box(100 + SNAP_THRESHOLD - 1, 300), siblings, bounds, {});
    expect(x).toBe(100);
    expect(guides.some((g) => g.axis === 'x')).toBe(true);
  });

  it('leaves an edge alone when it is beyond the threshold', () => {
    const far = 100 + SNAP_THRESHOLD + 20;
    const { x, guides } = computeSnap(box(far, 300), siblings, bounds, {});
    expect(x).toBe(far);
    expect(guides).toHaveLength(0);
  });

  it('snaps a right edge to a sibling right edge', () => {
    // sibling right edge = 300; our right edge should land there.
    const { x } = computeSnap(box(300 - 100 + 2, 320), siblings, bounds, {});
    expect(x + 100).toBe(300);
  });

  it('snaps horizontal centres to each other', () => {
    // sibling centre x = 200; our centre should land there -> x = 150.
    const { x } = computeSnap(box(153, 320), siblings, bounds, {});
    expect(x).toBe(150);
  });

  it('snaps to the container centre', () => {
    // container centre x = 300; our centre lands there -> x = 250.
    const { x } = computeSnap(box(252, 320), [], bounds, {});
    expect(x).toBe(250);
  });

  it('snaps to the container edges', () => {
    const { x, y } = computeSnap(box(3, 2), [], bounds, {});
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  /* Spec §19: a temporary way to disable snapping for fine positioning. */
  it('produces no snap and no guides while the disable modifier is held', () => {
    const raw = box(100 + 1, 100 + 1);
    const { x, y, guides } = computeSnap(raw, siblings, bounds, { disabled: true });
    expect(x).toBe(raw.x);
    expect(y).toBe(raw.y);
    expect(guides).toHaveLength(0);
  });

  it('falls back to the grid when nothing else is near, if grid snap is on', () => {
    const { x } = computeSnap(box(GRID_SIZE * 3 + 2, 333), [], { width: 5000, height: 5000 }, { grid: true });
    expect(x % GRID_SIZE).toBe(0);
  });

  it('prefers an object guide over the grid', () => {
    // 102 is 2px from the sibling edge at 100 and would otherwise grid-snap.
    const { x, guides } = computeSnap(box(102, 300), siblings, bounds, { grid: true });
    expect(x).toBe(100);
    expect(guides.length).toBeGreaterThan(0);
  });

  it('never snaps an element to itself', () => {
    const self = box(100, 100, 200, 60);
    const { x, y, guides } = computeSnap(self, [], { width: 5000, height: 5000 }, {});
    expect(x).toBe(100);
    expect(y).toBe(100);
    expect(guides).toHaveLength(0);
  });
});

describe('alignBoxes', () => {
  const boxes = [box(10, 10, 100, 40), box(50, 80, 60, 40), box(30, 150, 200, 40)];

  it('aligns left edges to the leftmost box', () => {
    expect(alignBoxes(boxes, 'left').map((b) => b.x)).toEqual([10, 10, 10]);
  });

  it('aligns right edges to the rightmost edge', () => {
    const aligned = alignBoxes(boxes, 'right');
    expect(aligned.map((b) => b.x + b.width)).toEqual([230, 230, 230]);
  });

  it('aligns horizontal centres', () => {
    const aligned = alignBoxes(boxes, 'center-x');
    const centres = aligned.map((b) => b.x + b.width / 2);
    expect(new Set(centres).size).toBe(1);
  });

  it('aligns top edges', () => {
    expect(alignBoxes(boxes, 'top').map((b) => b.y)).toEqual([10, 10, 10]);
  });

  it('leaves a single box untouched', () => {
    const one = [box(10, 10)];
    expect(alignBoxes(one, 'right')).toEqual(one);
  });
});

describe('distributeBoxes', () => {
  it('spaces boxes evenly on the horizontal axis', () => {
    const boxes = [box(0, 0, 40, 40), box(50, 0, 40, 40), box(300, 0, 40, 40)];
    const gaps = distributeBoxes(boxes, 'horizontal')
      .sort((a, b) => a.x - b.x)
      .map((b, i, arr) => (i === 0 ? null : b.x - arr[i - 1].x))
      .filter((g): g is number => g !== null);

    expect(new Set(gaps).size).toBe(1);
  });

  it('needs at least three boxes to mean anything', () => {
    const two = [box(0, 0), box(100, 0)];
    expect(distributeBoxes(two, 'horizontal')).toEqual(two);
  });
});
