import { create } from 'zustand';
import { lookupService, type LookupFilter, type LookupItemOf, type LookupListKey } from '../services/lookupService';

const key = (tenantSlug: string, list: LookupListKey, filter?: LookupFilter) =>
  `${tenantSlug}:${list}:${JSON.stringify(filter ?? {})}`;

interface ActiveLookupsState {
  byKey: Record<string, unknown[]>;
  loading: Record<string, boolean>;
  ensureLoaded: (tenantSlug: string, list: LookupListKey, filter?: LookupFilter) => Promise<void>;
}

/**
 * The active-only values of a lookup list, for pickers outside Settings (the
 * company form's business type/area/city, the company list's filters).
 * `useLookupList` always includes inactive values — it is built for the
 * Settings editor, which needs to show and reactivate them — so it is the
 * wrong cache for a picker that must offer only what is currently choosable.
 * Loaded once per tenant/list/filter and kept for the session.
 */
export const useActiveLookupsStore = create<ActiveLookupsState>((set, get) => ({
  byKey: {},
  loading: {},

  ensureLoaded: async (tenantSlug, list, filter) => {
    const k = key(tenantSlug, list, filter);
    if (get().byKey[k] || get().loading[k]) return;

    set((state) => ({ loading: { ...state.loading, [k]: true } }));
    try {
      const items = await lookupService.list(tenantSlug, list, false, filter);
      set((state) => ({ byKey: { ...state.byKey, [k]: items }, loading: { ...state.loading, [k]: false } }));
    } catch (error) {
      console.error(`Failed to load active ${list}`, error);
      set((state) => ({ loading: { ...state.loading, [k]: false } }));
    }
  },
}));

export function activeLookupsFor<L extends LookupListKey>(
  tenantSlug: string,
  list: L,
  filter?: LookupFilter
): LookupItemOf[L][] {
  return (useActiveLookupsStore.getState().byKey[key(tenantSlug, list, filter)] as LookupItemOf[L][]) ?? [];
}
