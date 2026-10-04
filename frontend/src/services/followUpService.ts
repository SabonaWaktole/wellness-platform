import { apiClient as api } from '../api';
import type { ActivityInput, Interaction } from '../types/client';
import type { FollowUp, FollowUpGroups, FollowUpListParams, RescheduleFollowUpInput, ScheduleFollowUpInput } from '../types/followUp';

/** The follow-ups API (M2 Slice 11: FR-FUP-01..10). Every response is scoped on the server. */
const base = (tenantSlug: string) => `/${tenantSlug}/follow-ups`;

export const followUpService = {
  /** FR-FUP-07: the caller's open follow-ups, grouped. */
  mine: async (tenantSlug: string): Promise<FollowUpGroups> =>
    (await api.get<{ data: FollowUpGroups }>(`${base(tenantSlug)}/mine`)).data.data,

  /** FR-FUP-07: the menu badge. */
  overdueCount: async (tenantSlug: string): Promise<number> =>
    (await api.get<{ data: { count: number } }>(`${base(tenantSlug)}/overdue-count`)).data.data.count,

  /** FR-FUP-08 and the deal and company pages: open follow-ups in the caller's scope. */
  list: async (tenantSlug: string, params: FollowUpListParams = {}): Promise<FollowUp[]> =>
    (
      await api.get<{ data: { items: FollowUp[] } }>(base(tenantSlug), {
        params: { ...params, overdueOnly: params.overdueOnly ? 'true' : undefined },
      })
    ).data.data.items,

  get: async (tenantSlug: string, id: string): Promise<FollowUp> =>
    (await api.get<{ data: FollowUp }>(`${base(tenantSlug)}/${id}`)).data.data,

  schedule: async (tenantSlug: string, input: ScheduleFollowUpInput): Promise<FollowUp> =>
    (await api.post<{ data: FollowUp }>(base(tenantSlug), input)).data.data,

  /** FR-FUP-06: records the activity that happened and closes the follow-up, together. */
  complete: async (tenantSlug: string, id: string, activity: ActivityInput): Promise<{ followUp: FollowUp; activity: Interaction }> =>
    (await api.post<{ data: { followUp: FollowUp; activity: Interaction } }>(`${base(tenantSlug)}/${id}/complete`, activity)).data.data,

  reschedule: async (tenantSlug: string, id: string, input: RescheduleFollowUpInput): Promise<FollowUp> =>
    (await api.post<{ data: FollowUp }>(`${base(tenantSlug)}/${id}/reschedule`, input)).data.data,

  cancel: async (tenantSlug: string, id: string, reason: string): Promise<FollowUp> =>
    (await api.post<{ data: FollowUp }>(`${base(tenantSlug)}/${id}/cancel`, { reason })).data.data,

  /** FR-FUP-10: the Sales Manager hands it to another salesperson. */
  reassign: async (tenantSlug: string, id: string, assignedUserId: string): Promise<FollowUp> =>
    (await api.post<{ data: FollowUp }>(`${base(tenantSlug)}/${id}/reassign`, { assignedUserId })).data.data,
};

/** Workspace sales settings (M2 Slice 11, FR-DEAL-12), under `settings.manage`. */
export const salesSettingsService = {
  get: async (tenantSlug: string): Promise<{ staleDealDays: number }> =>
    (await api.get<{ data: { staleDealDays: number } }>(`/${tenantSlug}/sales-settings`)).data.data,

  update: async (tenantSlug: string, patch: { staleDealDays: number }): Promise<{ staleDealDays: number }> =>
    (await api.patch<{ data: { staleDealDays: number } }>(`/${tenantSlug}/sales-settings`, patch)).data.data,
};
