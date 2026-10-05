import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { roleDashboardService } from '../../services/dashboardService';
import type { DashboardData, DashboardFilters, DashboardPreset, RoleDashboardKind } from '../../types/roleDashboard';

/**
 * Loads one role dashboard for a period and a location, and again on `refresh` (FR-DSH-07). Nothing
 * is kept between visits: the server works the figures out each time. A custom range waits for both
 * of its days.
 */
export function useRoleDashboard(kind: RoleDashboardKind) {
  const { tenantSlug } = useParams();
  const [preset, setPreset] = useState<DashboardPreset>('THIS_MONTH');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [cityId, setCityId] = useState('');

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = preset !== 'CUSTOM' || (from !== '' && to !== '' && from <= to);
  const filters: DashboardFilters = {
    preset,
    ...(preset === 'CUSTOM' ? { from, to } : {}),
    ...(salespersonId ? { salespersonId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(cityId ? { cityId } : {}),
  };
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(async () => {
    if (!tenantSlug || !ready) return;
    setLoading(true);
    setFailed(false);
    try {
      setData(await roleDashboardService.fetch(tenantSlug, kind, JSON.parse(filterKey)));
    } catch (error) {
      console.error('Failed to load the dashboard', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, kind, filterKey, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    failed,
    refresh,
    preset,
    from,
    to,
    salespersonId,
    areaId,
    cityId,
    setPreset,
    setFrom,
    setTo,
    setSalespersonId,
    // A city belongs to one area: changing the area clears it.
    setAreaId: (id: string) => {
      setAreaId(id);
      setCityId('');
    },
    setCityId,
  };
}

export type RoleDashboardState = ReturnType<typeof useRoleDashboard>;
