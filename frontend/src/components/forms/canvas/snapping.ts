import type { Box } from '../../../types/form';

/**
 * Alignment guides, snapping, and multi-selection align/distribute (spec §19).
 *
 * Pure geometry, deliberately outside React: the same maths runs on every
 * pointermove during a drag, and it is far easier to prove correct in a test
 * than to debug through a DOM.
 */

/** How close an edge must be, in document px, before it snaps. Small enough
 *  not to fight deliberate placement, large enough to feel magnetic. */
export const SNAP_THRESHOLD = 6;

/** Grid step used only when object guides find nothing (§19: available, but
 *  never intrusive). */
export const GRID_SIZE = 8;

export interface SnapOptions {
  /** Spec §19's "temporary way to disable snapping for fine positioning" —
   *  wired to Alt in useKeyboard. */
  disabled?: boolean;
  grid?: boolean;
}

export interface Guide {
  axis: 'x' | 'y';
  /** Document coordinate the guide sits at. */
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

interface Candidate {
  /** Where the moving box's own reference line would land. */
  target: number;
  /** Offset from the box's x/y to that reference line (0, w/2 or w). */
  offset: number;
}

const candidatesFor = (values: number[], size: number): Candidate[] =>
  values.flatMap((v) => [
    { target: v, offset: 0 },
    { target: v, offset: size / 2 },
    { target: v, offset: size },
  ]);

const bestSnap = (origin: number, size: number, lines: number[]): { value: number; guide: number } | null => {
  let best: { value: number; guide: number; distance: number } | null = null;

  for (const { target, offset } of candidatesFor(lines, size)) {
    const value = target - offset;
    const distance = Math.abs(value - origin);
    if (distance <= SNAP_THRESHOLD && (!best || distance < best.distance)) {
      best = { value, guide: target, distance };
    }
  }

  return best ? { value: best.value, guide: best.guide } : null;
};

/**
 * Snaps a moving box against its siblings' edges and centres, and against the
 * container's edges and centre.
 *
 * Object guides win over the grid: an owner lining a field up with the one
 * above it means that edge, not the nearest multiple of 8 (§19's "should not
 * feel intrusive").
 */
export const computeSnap = (
  box: Box,
  siblings: Box[],
  container: { width: number; height: number },
  options: SnapOptions
): SnapResult => {
  if (options.disabled) return { x: box.x, y: box.y, guides: [] };

  const xLines = [
    0,
    container.width / 2,
    container.width,
    ...siblings.flatMap((s) => [s.x, s.x + s.width / 2, s.x + s.width]),
  ];
  const yLines = [
    0,
    container.height / 2,
    container.height,
    ...siblings.flatMap((s) => [s.y, s.y + s.height / 2, s.y + s.height]),
  ];

  const snapX = bestSnap(box.x, box.width, xLines);
  const snapY = bestSnap(box.y, box.height, yLines);

  const guides: Guide[] = [];
  let x = box.x;
  let y = box.y;

  if (snapX) {
    x = snapX.value;
    guides.push({ axis: 'x', position: snapX.guide });
  } else if (options.grid) {
    x = Math.round(box.x / GRID_SIZE) * GRID_SIZE;
  }

  if (snapY) {
    y = snapY.value;
    guides.push({ axis: 'y', position: snapY.guide });
  } else if (options.grid) {
    y = Math.round(box.y / GRID_SIZE) * GRID_SIZE;
  }

  return { x, y, guides };
};

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/** Aligns a multi-selection against its own bounding box (§19). */
export const alignBoxes = <T extends Box>(boxes: T[], mode: AlignMode): T[] => {
  if (boxes.length < 2) return boxes;

  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));

  return boxes.map((b) => {
    switch (mode) {
      case 'left':
        return { ...b, x: left };
      case 'right':
        return { ...b, x: right - b.width };
      case 'center-x':
        return { ...b, x: (left + right) / 2 - b.width / 2 };
      case 'top':
        return { ...b, y: top };
      case 'bottom':
        return { ...b, y: bottom - b.height };
      case 'center-y':
        return { ...b, y: (top + bottom) / 2 - b.height / 2 };
      default:
        return b;
    }
  });
};

/**
 * Evenly spaces a selection between its outermost members, which stay put.
 * Fewer than three boxes has no meaningful distribution — the two ends are
 * already the whole selection.
 */
export const distributeBoxes = <T extends Box>(boxes: T[], axis: 'horizontal' | 'vertical'): T[] => {
  if (boxes.length < 3) return boxes;

  const key = axis === 'horizontal' ? 'x' : 'y';
  const sorted = [...boxes].sort((a, b) => a[key] - b[key]);
  const first = sorted[0][key];
  const last = sorted[sorted.length - 1][key];
  const step = (last - first) / (sorted.length - 1);

  const moved = new Map<T, number>();
  sorted.forEach((b, i) => moved.set(b, first + step * i));

  return boxes.map((b) => ({ ...b, [key]: moved.get(b) ?? b[key] }));
};
