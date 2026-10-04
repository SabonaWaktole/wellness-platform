import { apiClient as api } from '../api';
import type { CalendarFeed, CalendarFeedParams } from '../types/calendar';

/** The calendar feed (M2 Slice 12: FR-CAL-01, 04, 05), scoped on the server by `calendar.view`. */
export const calendarService = {
  feed: async (tenantSlug: string, params: CalendarFeedParams, signal?: AbortSignal): Promise<CalendarFeed> =>
    (
      await api.get<{ data: CalendarFeed }>(`/${tenantSlug}/calendar`, {
        params: {
          from: params.from,
          to: params.to,
          // Lists travel comma-separated, as the backend reads them.
          userIds: params.userIds?.length ? params.userIds.join(',') : undefined,
          kinds: params.kinds?.length ? params.kinds.join(',') : undefined,
          types: params.types?.length ? params.types.join(',') : undefined,
        },
        signal,
      })
    ).data.data,
};
