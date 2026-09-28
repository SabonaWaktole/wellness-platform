import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStatusLabelsStore } from '../store/useStatusLabelsStore';
import type { StatusDomain, StatusLabelItem } from '../services/statusLabelService';

/** A domain's status labels, loaded once per tenant and kept in sync with edits on the Statuses page. */
export function useStatusLabels(domain: StatusDomain): StatusLabelItem[] {
  const { tenantSlug } = useParams();
  const ensureLoaded = useStatusLabelsStore((state) => state.ensureLoaded);
  const items = useStatusLabelsStore((state) => (tenantSlug ? state.byDomain[`${tenantSlug}:${domain}`] : undefined));

  useEffect(() => {
    if (tenantSlug) ensureLoaded(tenantSlug, domain);
  }, [tenantSlug, domain, ensureLoaded]);

  return items ?? [];
}
