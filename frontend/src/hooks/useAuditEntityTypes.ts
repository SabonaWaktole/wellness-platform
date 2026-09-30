import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auditService } from '../services/auditService';
import type { AuditEntityGroup } from '../services/auditService';

/** The audit log's record-type filter options, grouped, from the backend (FR-AUD-10). */
export const useAuditEntityTypes = () => {
  const { tenantSlug } = useParams();
  const [groups, setGroups] = useState<AuditEntityGroup[]>([]);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    auditService
      .entityTypes(tenantSlug)
      .then((loaded) => {
        if (!cancelled) setGroups(loaded);
      })
      .catch((error) => console.error('Failed to fetch audit entity types', error));
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  return { groups };
};
