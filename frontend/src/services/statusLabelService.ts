import { apiClient as api } from '../api';

/** `deal` is the pipeline's stages (M2 Slice 6, FR-DEAL-06). */
export type StatusDomain = 'contract' | 'payment' | 'deal';

export interface StatusLabelItem {
  key: string;
  labelSq: string;
  labelEn: string | null;
  colour: string;
  order: number;
}

/** Settings → Statuses' client (FR-SET-07, 08). */
export const statusLabelService = {
  /** Every status of `domain`, in display order — the tenant's own label where set, the catalogue default otherwise. */
  list: async (tenantSlug: string, domain: StatusDomain): Promise<StatusLabelItem[]> => {
    const response = await api.get<{ data: StatusLabelItem[] }>(`/${tenantSlug}/status-labels/${domain}`);
    return response.data.data;
  },

  update: async (
    tenantSlug: string,
    domain: StatusDomain,
    key: string,
    edit: { labelSq: string; labelEn?: string | null; colour: string }
  ): Promise<StatusLabelItem> => {
    const response = await api.patch<{ item: StatusLabelItem }>(`/${tenantSlug}/status-labels/${domain}/${key}`, edit);
    return response.data.item;
  },

  reorder: async (tenantSlug: string, domain: StatusDomain, keys: string[]): Promise<StatusLabelItem[]> => {
    const response = await api.put<{ data: StatusLabelItem[] }>(`/${tenantSlug}/status-labels/${domain}/order`, { keys });
    return response.data.data;
  },
};
