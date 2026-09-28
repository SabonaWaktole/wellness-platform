import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auditService } from '../services/auditService';
import type { AuditEntry, AuditFilters } from '../services/auditService';

const DEFAULT_LIMIT = 25;

/** Settings → Audit log's data (Slice 7: FR-AUD-06). */
export const useAuditLog = () => {
  const { tenantSlug } = useParams();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await auditService.search(tenantSlug, filters, page, limit);
      setEntries(result.data);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to fetch audit entries', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, filters, page, limit]);

  /** Any filter change goes back to page 1 — a page number from the old filter rarely still applies. */
  const updateFilters = (next: AuditFilters) => {
    setFilters(next);
    setPage(1);
  };

  const exportCsv = async () => {
    if (!tenantSlug) return;
    const blob = await auditService.downloadCsv(tenantSlug, filters);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    filters,
    updateFilters,
    page,
    setPage,
    limit,
    setLimit: (next: number) => {
      setLimit(next);
      setPage(1);
    },
    entries,
    total,
    loading,
    loadFailed,
    fetchEntries,
    exportCsv,
  };
};
