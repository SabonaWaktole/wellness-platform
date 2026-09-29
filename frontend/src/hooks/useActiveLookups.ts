import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useActiveLookupsStore } from '../store/useActiveLookupsStore';
import type { LookupFilter, LookupItemOf, LookupListKey } from '../services/lookupService';

/** A list's active values, loaded once per tenant/list/filter. See useActiveLookupsStore. */
export function useActiveLookups<L extends LookupListKey>(list: L, filter?: LookupFilter): LookupItemOf[L][] {
  const { tenantSlug } = useParams();
  const ensureLoaded = useActiveLookupsStore((state) => state.ensureLoaded);
  const filterKey = JSON.stringify(filter ?? {});
  const items = useActiveLookupsStore((state) =>
    tenantSlug ? (state.byKey[`${tenantSlug}:${list}:${filterKey}`] as LookupItemOf[L][] | undefined) : undefined
  );

  useEffect(() => {
    if (tenantSlug) ensureLoaded(tenantSlug, list, filter);
    // `filter`'s values, not its identity, decide when to (re)load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, list, ensureLoaded, filterKey]);

  return items ?? [];
}
