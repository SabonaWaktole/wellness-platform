import { apiClient as api } from '../api';

/** The admin-managed lists (Slices 8, 9, 10). */
export type LookupListKey = 'risk-levels' | 'business-types' | 'areas' | 'cities' | 'follow-up-intervals' | 'lost-reasons';

/** What every list value has. Only the Albanian name is required (FR-LNG-03). */
export interface LookupItem {
  id: string;
  nameSq: string;
  nameEn: string | null;
  order: number;
  active: boolean;
}

export interface RiskLevel extends LookupItem {
  level: number;
  description: string | null;
}

export interface BusinessType extends LookupItem {
  riskLevelId: string;
}

export type Area = LookupItem;

export interface City extends LookupItem {
  areaId: string;
}

export interface FollowUpInterval extends LookupItem {
  days: number;
}

export type LostReason = LookupItem;

export interface LookupItemOf {
  'risk-levels': RiskLevel;
  'business-types': BusinessType;
  areas: Area;
  cities: City;
  'follow-up-intervals': FollowUpInterval;
  'lost-reasons': LostReason;
}

/** The body of a create or update: the labels plus the list's own fields. */
export type LookupValues = Record<string, unknown>;

/** Narrows a read or reorder by the list's own fields, e.g. City's `areaId` (FR-SET-04). */
export type LookupFilter = Record<string, string>;

/** Settings → Lists' client (FR-SET-01, 02, 03, 04). */
export const lookupService = {
  /** Active values only, unless `includeInactive` and the caller manages the lists. */
  list: async <L extends LookupListKey>(
    tenantSlug: string,
    list: L,
    includeInactive = false,
    filter?: LookupFilter
  ): Promise<LookupItemOf[L][]> => {
    const response = await api.get<{ data: LookupItemOf[L][] }>(`/${tenantSlug}/lookups/${list}`, {
      params: { ...filter, ...(includeInactive ? { includeInactive: 'true' } : undefined) },
    });
    return response.data.data;
  },

  create: async <L extends LookupListKey>(tenantSlug: string, list: L, values: LookupValues): Promise<LookupItemOf[L]> => {
    const response = await api.post<{ item: LookupItemOf[L] }>(`/${tenantSlug}/lookups/${list}`, values);
    return response.data.item;
  },

  update: async <L extends LookupListKey>(tenantSlug: string, list: L, id: string, values: LookupValues): Promise<LookupItemOf[L]> => {
    const response = await api.patch<{ item: LookupItemOf[L] }>(`/${tenantSlug}/lookups/${list}/${id}`, values);
    return response.data.item;
  },

  reorder: async <L extends LookupListKey>(tenantSlug: string, list: L, ids: string[], filter?: LookupFilter): Promise<LookupItemOf[L][]> => {
    const response = await api.put<{ data: LookupItemOf[L][] }>(`/${tenantSlug}/lookups/${list}/order`, { ids }, { params: filter });
    return response.data.data;
  },

  /** `cascade: true` also deactivates an area's active cities (FR-SET-04); refused without it. */
  setActive: async <L extends LookupListKey>(
    tenantSlug: string,
    list: L,
    id: string,
    active: boolean,
    cascade = false
  ): Promise<LookupItemOf[L]> => {
    const response = await api.post<{ item: LookupItemOf[L] }>(
      `/${tenantSlug}/lookups/${list}/${id}/${active ? 'reactivate' : 'deactivate'}`,
      active ? undefined : { cascade }
    );
    return response.data.item;
  },

  remove: async (tenantSlug: string, list: LookupListKey, id: string): Promise<void> => {
    await api.delete(`/${tenantSlug}/lookups/${list}/${id}`);
  },
};
