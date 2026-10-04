import { minutesIntoDay } from './calendarDays';

/** An item with no end takes this much room on the day's grid. */
export const DEFAULT_SLOT_MINUTES = 30;
/** Nothing is drawn shorter than this, so a 5-minute call can still be read and clicked. */
export const MIN_SLOT_MINUTES = 30;

export interface TimedItem {
  id: string;
  scheduledAt: string;
  endAt: string | null;
}

export interface PlacedItem<T extends TimedItem> {
  item: T;
  /** Minutes after midnight, in the workspace zone. */
  top: number;
  height: number;
  /** Which of `lanes` side-by-side columns the item sits in. */
  lane: number;
  lanes: number;
}

/**
 * Lays one day's items on a time grid. Items that overlap in time share the
 * width: each gets a lane, and every item in a group of overlapping ones is
 * `lanes` wide, so nothing is hidden behind another. An item that runs past
 * midnight is cut at it (the next day shows its own part, if it has one).
 */
export function layoutDay<T extends TimedItem>(items: T[], timeZone: string): PlacedItem<T>[] {
  const sorted = items
    .map((item) => {
      const top = minutesIntoDay(item.scheduledAt, timeZone);
      const length = item.endAt
        ? Math.round((new Date(item.endAt).getTime() - new Date(item.scheduledAt).getTime()) / 60000)
        : DEFAULT_SLOT_MINUTES;
      const height = Math.max(MIN_SLOT_MINUTES, Math.min(length, 24 * 60 - top));
      return { item, top, height };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height || a.item.id.localeCompare(b.item.id));

  const placed: PlacedItem<T>[] = [];
  let group: PlacedItem<T>[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  const closeGroup = () => {
    for (const entry of group) entry.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const entry of sorted) {
    if (group.length > 0 && entry.top >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= entry.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = entry.top + entry.height;
    groupEnd = Math.max(groupEnd, entry.top + entry.height);
    group.push({ ...entry, lane, lanes: 1 });
  }
  closeGroup();
  return placed;
}
