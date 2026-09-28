import { create } from 'zustand';
import { statusLabelService, type StatusDomain, type StatusLabelItem } from '../services/statusLabelService';

const domainKey = (tenantSlug: string, domain: StatusDomain) => `${tenantSlug}:${domain}`;

interface StatusLabelsState {
  byDomain: Record<string, StatusLabelItem[]>;
  loading: Record<string, boolean>;
  /** Loads a domain's labels once per tenant; a later call is a no-op unless `force`. */
  ensureLoaded: (tenantSlug: string, domain: StatusDomain, force?: boolean) => Promise<void>;
}

/**
 * The tenant's contract and payment status labels, shared across every
 * screen that shows a status badge. Loaded once per tenant and domain and
 * refreshed after an edit on the Statuses settings page (FR-SET-07, 08), so
 * renaming "Active" there changes every badge without a full page reload.
 */
export const useStatusLabelsStore = create<StatusLabelsState>((set, get) => ({
  byDomain: {},
  loading: {},

  ensureLoaded: async (tenantSlug, domain, force = false) => {
    const key = domainKey(tenantSlug, domain);
    if (!force && (get().byDomain[key] || get().loading[key])) return;

    set((state) => ({ loading: { ...state.loading, [key]: true } }));
    try {
      const items = await statusLabelService.list(tenantSlug, domain);
      set((state) => ({ byDomain: { ...state.byDomain, [key]: items }, loading: { ...state.loading, [key]: false } }));
    } catch (error) {
      console.error(`Failed to load ${domain} status labels`, error);
      set((state) => ({ loading: { ...state.loading, [key]: false } }));
    }
  },
}));

/** Looks up one status's tenant-set label and colour, or `undefined` if not yet loaded. */
export function statusLabelFor(tenantSlug: string, domain: StatusDomain, key: string): StatusLabelItem | undefined {
  return useStatusLabelsStore.getState().byDomain[domainKey(tenantSlug, domain)]?.find((item) => item.key === key);
}
