import type { CalendarItem, ContractCalendarItem } from '../../types/calendar';

/** The feed's items by the workspace-zone day they start on, each day earliest first. */
export function groupByDay(items: CalendarItem[], dayKeyOf: (instant: string) => string): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dayKeyOf(item.scheduledAt);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
  return byDay;
}

/** A day key as a date a formatter can read in any zone: noon UTC. */
export const dayAsDate = (key: string): Date => new Date(`${key}T12:00:00Z`);

/** The contract end and renewal dates by their calendar day. Their `date` is already a day, in no time zone. */
export function groupContractsByDay(items: ContractCalendarItem[]): Map<string, ContractCalendarItem[]> {
  const byDay = new Map<string, ContractCalendarItem[]>();
  for (const item of items) {
    const list = byDay.get(item.date);
    if (list) list.push(item);
    else byDay.set(item.date, [item]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return byDay;
}
