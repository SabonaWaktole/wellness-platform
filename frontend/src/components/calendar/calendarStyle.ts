import { channelIcon } from '../activities/channelIcon';
import type { CalendarItem } from '../../types/calendar';

/** FR-CAL-01: each type has its own icon (the same as the activity timeline's) and its own colour (`.type-*` in Calendar.module.css). */
export const typeIcon = (type: string) => channelIcon(type);

/** The six validated categorical steps, in their fixed order (tokens.css). */
const PERSON_COLOURS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'] as const;

/**
 * FR-CAL-05: one colour per salesperson. Assigned by position in the team's
 * list, so the first six people are always distinct from each other; a seventh
 * shares a colour and is told apart by the name on the item. The same person
 * keeps their colour as long as the team does not change.
 */
export function personColours(userIds: string[]): (userId: string) => string {
  const order = [...userIds].sort();
  return (userId) => {
    const index = order.indexOf(userId);
    if (index !== -1) return PERSON_COLOURS[index % PERSON_COLOURS.length];
    // Someone outside the list (a colleague deactivated since): stable from the id, never random.
    let hash = 0;
    for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return PERSON_COLOURS[hash % PERSON_COLOURS.length];
  };
}

export const isOpen = (item: Pick<CalendarItem, 'status'>): boolean => item.status === 'SCHEDULED' || item.status === 'CONFIRMED';
