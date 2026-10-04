import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { calendarService } from '../services/calendarService';
import type { CalendarFeed, CalendarFeedParams } from '../types/calendar';

export interface UseCalendarFeed {
  feed: CalendarFeed | null;
  /** True while the first load of a range is under way; a refetch keeps the old feed on screen. */
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * The calendar feed for the visible range. It refetches whenever the range or
 * a filter changes, which is what navigating the calendar does (the old fixed
 * mount-month window never refetched). An answer for a range that is no
 * longer visible is dropped, so a slow response cannot overwrite a newer one.
 */
export function useCalendarFeed(params: CalendarFeedParams | null): UseCalendarFeed {
  const { tenantSlug } = useParams();
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const latest = useRef(0);

  // A stable key, so a new array with the same members is not a new request.
  const key = params ? JSON.stringify([params.from, params.to, params.userIds ?? [], params.kinds ?? [], params.types ?? []]) : null;

  useEffect(() => {
    if (!tenantSlug || !params || key === null) return;
    const request = ++latest.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    calendarService
      .feed(tenantSlug, params, controller.signal)
      .then((result) => {
        if (request === latest.current) setFeed(result);
      })
      .catch((failure: any) => {
        if (request !== latest.current || failure?.code === 'ERR_CANCELED') return;
        setError(failure?.response?.data?.error ?? 'Failed to load the calendar');
      })
      .finally(() => {
        if (request === latest.current) setIsLoading(false);
      });
    return () => controller.abort();
    // `key` stands for the params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, key, reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  return { feed, isLoading, error, reload };
}
