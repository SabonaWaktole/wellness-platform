import { apiClient as api } from '../api';

/** The admin-managed lists (Slice 8). Slices 9 and 10 add areas, cities and the sales lists. */
export type LookupListKey = 'risk-levels' | 'business-types';

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

export interface LookupItemOf {
  'risk-levels': RiskLevel;
  'business-types': BusinessType;
}

/** The body of a create or update: the labels plus the list's own fields. */
export type LookupValues = Record<string, unknown>;

/** Settings → Lists' client (FR-SET-01, 02). */
export const lookupService = {
  /** Active values only, unless `includeInactive` and the caller manages the lists. */
  list: async <L extends LookupListKey>(tenantSlug: string, list: L, includeInactive = false): Promise<LookupItemOf[L][]> => {
    const response = await api.get<{ data: LookupItemOf[L][] }>(`/${tenantSlug}/lookups/${list}`, {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
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

  reorder: async <L extends LookupListKey>(tenantSlug: string, list: L, ids: string[]): Promise<LookupItemOf[L][]> => {
    const response = await api.put<{ data: LookupItemOf[L][] }>(`/${tenantSlug}/lookups/${list}/order`, { ids });
    return response.data.data;
  },

  setActive: async <L extends LookupListKey>(tenantSlug: string, list: L, id: string, active: boolean): Promise<LookupItemOf[L]> => {
    const response = await api.post<{ item: LookupItemOf[L] }>(
      `/${tenantSlug}/lookups/${list}/${id}/${active ? 'reactivate' : 'deactivate'}`
    );
    return response.data.item;
  },

  remove: async (tenantSlug: string, list: LookupListKey, id: string): Promise<void> => {
    await api.delete(`/${tenantSlug}/lookups/${list}/${id}`);
  },
};
