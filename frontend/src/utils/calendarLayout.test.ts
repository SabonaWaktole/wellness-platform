import { describe, expect, it } from 'vitest';
import { layoutDay } from './calendarLayout';

const TIRANE = 'Europe/Tirane';
// 2026-10-05 is on summer time in Tirane (UTC+2): 07:00Z is 09:00 local.
const at = (hhmm: string) => `2026-10-05T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;
const item = (id: string, start: string, end: string | null) => ({ id, scheduledAt: at(start), endAt: end ? at(end) : null });

describe('layoutDay (M2 Slice 12)', () => {
  it('places an item at its start, as long as it lasts', () => {
    const [placed] = layoutDay([item('a', '10:00', '11:30')], TIRANE);
    expect(placed).toMatchObject({ top: 10 * 60, height: 90, lane: 0, lanes: 1 });
  });

  it('gives an item with no end a half hour, and nothing is shorter than that', () => {
    const [noEnd, shortCall] = layoutDay([item('a', '09:00', null), item('b', '12:00', '12:05')], TIRANE);
    expect(noEnd.height).toBe(30);
    expect(shortCall.height).toBe(30);
  });

  it('puts overlapping items side by side, each as wide as the group', () => {
    const placed = layoutDay([item('a', '10:00', '11:00'), item('b', '10:30', '11:30'), item('c', '10:15', '10:45')], TIRANE);
    expect(placed.map((p) => p.lanes)).toEqual([3, 3, 3]);
    expect(new Set(placed.map((p) => p.lane)).size).toBe(3);
  });

  it('items that only touch do not share a lane group', () => {
    const placed = layoutDay([item('a', '10:00', '11:00'), item('b', '11:00', '12:00')], TIRANE);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]]);
  });

  it('reuses a lane that has freed up inside a group', () => {
    const placed = layoutDay([item('a', '10:00', '12:00'), item('b', '10:30', '11:00'), item('c', '11:00', '11:30')], TIRANE);
    const lanes = Object.fromEntries(placed.map((p) => [p.item.id, p.lane]));
    expect(lanes.a).toBe(0);
    expect(lanes.b).toBe(1);
    expect(lanes.c).toBe(1);
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
  });

  it('cuts an item that runs past midnight at midnight', () => {
    const [placed] = layoutDay([{ id: 'a', scheduledAt: at('23:00'), endAt: '2026-10-06T00:30:00.000Z' }], TIRANE);
    expect(placed.top + placed.height).toBe(24 * 60);
  });

  it('reads the times in the workspace zone, not the host\'s', () => {
    const [summer] = layoutDay([{ id: 'a', scheduledAt: '2026-07-27T07:00:00.000Z', endAt: null }], TIRANE);
    const [winter] = layoutDay([{ id: 'a', scheduledAt: '2026-01-15T08:00:00.000Z', endAt: null }], TIRANE);
    expect(summer.top).toBe(9 * 60);
    expect(winter.top).toBe(9 * 60);
  });
});
