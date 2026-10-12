import { describe, expect, it } from 'vitest';
import { placePopover, SHEET_BREAKPOINT } from './popoverPlacement';

const SIZE = { width: 320, height: 200 };
const DESKTOP = { width: 1024, height: 768 };
const box = (top: number, left: number, width = 100, height = 30) => ({ top, left, width, height });

describe('SUP-15 popover placement', () => {
  it('SUP-15 sits below the target, centred on it, when that fits', () => {
    expect(placePopover(box(100, 400), SIZE, DESKTOP, 'bottom')).toEqual({
      mode: 'floating',
      side: 'bottom',
      top: 136,
      left: 290,
      arrow: 160,
    });
  });

  it('SUP-15 flips above when there is no room below', () => {
    expect(placePopover(box(600, 400), SIZE, DESKTOP, 'bottom')).toMatchObject({ side: 'top', top: 394 });
  });

  it('SUP-15 honours a preferred side that fits', () => {
    expect(placePopover(box(300, 100, 100, 40), SIZE, DESKTOP, 'right')).toEqual({
      mode: 'floating',
      side: 'right',
      left: 206,
      top: 220,
      arrow: 100,
    });
  });

  it('SUP-15 flips a side preference to the opposite side when it does not fit', () => {
    expect(placePopover(box(300, 900, 100, 40), SIZE, DESKTOP, 'right')).toMatchObject({ side: 'left', left: 574 });
  });

  it('SUP-15 falls back to a perpendicular side when neither of the pair fits', () => {
    const short = { width: 800, height: 300 };
    expect(placePopover(box(100, 100, 50, 20), { width: 320, height: 280 }, short, 'bottom')).toMatchObject({ side: 'right' });
  });

  it('SUP-15 clamps to the left margin and keeps the arrow on the target', () => {
    const placed = placePopover(box(100, 0, 40, 30), SIZE, DESKTOP, 'bottom');
    expect(placed).toMatchObject({ left: 8, arrow: 16 });
  });

  it('SUP-15 clamps to the right margin', () => {
    const placed = placePopover(box(100, 950, 60, 30), SIZE, DESKTOP, 'bottom');
    expect(placed).toMatchObject({ left: 696, arrow: 284 });
  });

  it('SUP-15 when nothing fits it still stays inside the margin', () => {
    const placed = placePopover(box(100, 100, 50, 20), { width: 790, height: 290 }, { width: 800, height: 300 }, 'bottom');
    expect(placed.mode).toBe('floating');
    if (placed.mode === 'floating') {
      expect(placed.left).toBeGreaterThanOrEqual(8);
      expect(placed.top).toBeGreaterThanOrEqual(8);
    }
  });

  it('SUP-15 becomes a bottom sheet below 768 px', () => {
    expect(SHEET_BREAKPOINT).toBe(768);
    expect(placePopover(box(100, 100), SIZE, { width: 767, height: 900 }, 'bottom')).toEqual({ mode: 'sheet' });
    expect(placePopover(box(100, 100), SIZE, { width: 768, height: 900 }, 'bottom').mode).toBe('floating');
  });
});
