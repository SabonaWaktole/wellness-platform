import type { TargetRect } from './types';

/**
 * Where the tour card goes relative to its target. Same spacing constants as
 * `DropdownMenu` (its `GAP` and `MARGIN`), which is not refactored to share them.
 */
const GAP = 6;
const MARGIN = 8;
/** Keeps the arrow off the card's rounded corners. */
const ARROW_INSET = 16;
export const SHEET_BREAKPOINT = 768;

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Size {
  width: number;
  height: number;
}

export type Placement =
  | { mode: 'floating'; side: Side; top: number; left: number; /** Offset of the arrow along the card's edge. */ arrow: number }
  | { mode: 'sheet' };

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const PERPENDICULAR: Record<Side, [Side, Side]> = {
  top: ['right', 'left'],
  bottom: ['right', 'left'],
  left: ['bottom', 'top'],
  right: ['bottom', 'top'],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

function spaceOn(side: Side, target: TargetRect, viewport: Size): number {
  switch (side) {
    case 'top':
      return target.top - MARGIN;
    case 'bottom':
      return viewport.height - (target.top + target.height) - MARGIN;
    case 'left':
      return target.left - MARGIN;
    case 'right':
      return viewport.width - (target.left + target.width) - MARGIN;
  }
}

const needed = (side: Side, size: Size) => (side === 'top' || side === 'bottom' ? size.height : size.width) + GAP;

/**
 * Prefers `preferred`, flips to the opposite side when it does not fit, then
 * tries the perpendicular sides, and when nothing fits uses the roomiest side.
 * The card is always clamped inside the viewport margin. Below 768 px it is a
 * bottom sheet and the target is not used.
 */
export function placePopover(target: TargetRect, size: Size, viewport: Size, preferred: Side = 'bottom'): Placement {
  if (viewport.width < SHEET_BREAKPOINT) return { mode: 'sheet' };

  const order = [preferred, OPPOSITE[preferred], ...PERPENDICULAR[preferred]];
  const side =
    order.find((candidate) => spaceOn(candidate, target, viewport) >= needed(candidate, size)) ??
    order.reduce((best, candidate) => (spaceOn(candidate, target, viewport) > spaceOn(best, target, viewport) ? candidate : best));

  const centreX = target.left + target.width / 2;
  const centreY = target.top + target.height / 2;
  const maxLeft = viewport.width - size.width - MARGIN;
  const maxTop = viewport.height - size.height - MARGIN;

  let top: number;
  let left: number;
  let arrow: number;
  if (side === 'top' || side === 'bottom') {
    left = clamp(centreX - size.width / 2, MARGIN, maxLeft);
    top = clamp(side === 'bottom' ? target.top + target.height + GAP : target.top - size.height - GAP, MARGIN, maxTop);
    arrow = clamp(centreX - left, ARROW_INSET, size.width - ARROW_INSET);
  } else {
    top = clamp(centreY - size.height / 2, MARGIN, maxTop);
    left = clamp(side === 'right' ? target.left + target.width + GAP : target.left - size.width - GAP, MARGIN, maxLeft);
    arrow = clamp(centreY - top, ARROW_INSET, size.height - ARROW_INSET);
  }
  return { mode: 'floating', side, top, left, arrow };
}
