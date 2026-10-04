import { useDateFormat } from './useDateFormat';
import { addDays, startOfWeek, type CalendarView } from '../utils/calendarDays';

/** The heading for what is on screen, in the workspace's locale and zone (FR-CAL-08). */
export function useRangeTitle() {
  const dates = useDateFormat();
  return (view: CalendarView, anchor: string, days: string[]): string => {
    // A day key read at noon UTC, so no zone moves it to another day.
    const at = (key: string) => new Date(`${key}T12:00:00Z`);
    const named = (key: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(dates.locale, { ...options, timeZone: 'UTC' }).format(at(key));
    switch (view) {
      case 'day':
        return named(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'month':
        return named(anchor, { month: 'long', year: 'numeric' });
      case 'week':
      case 'agenda': {
        const first = view === 'week' ? startOfWeek(anchor) : days[0];
        const last = view === 'week' ? addDays(first, 6) : days[days.length - 1];
        return `${named(first, { day: 'numeric', month: 'short' })} – ${named(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
    }
  };
}
