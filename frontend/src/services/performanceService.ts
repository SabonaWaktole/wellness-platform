import { apiClient } from '../api';
import type {
  PerformanceFilters,
  PerformanceIndicator,
  PerformanceRecordsPage,
  PerformanceResult,
  PerformanceSeries,
  PeriodPreset,
} from '../types/performance';

/** The query the server reads: the period and the salespeople, never a scope (FR-RBAC-23). */
const query = (filters: PerformanceFilters) => ({
  preset: filters.preset,
  ...(filters.preset === 'CUSTOM' ? { from: filters.from, to: filters.to } : {}),
  ...(filters.salespersonIds?.length ? { salespersonIds: filters.salespersonIds.join(',') } : {}),
  ...(filters.compare ? { compare: 'true' } : {}),
});

export const performanceService = {
  /** One row per salesperson and a total row (FR-PRF-01 to 06). The server applies the viewer's scope and the value rule. */
  fetch: async (tenantSlug: string, filters: PerformanceFilters): Promise<PerformanceResult> => {
    const response = await apiClient.get<PerformanceResult>(`/${tenantSlug}/performance`, { params: query(filters) });
    return response.data;
  },

  /** The activities, offers, deals or follow-ups behind one indicator, under the same filters (FR-PRF-07). */
  fetchRecords: async (
    tenantSlug: string,
    filters: PerformanceFilters,
    indicator: PerformanceIndicator,
    page: number,
    limit: number
  ): Promise<PerformanceRecordsPage> => {
    const response = await apiClient.get<PerformanceRecordsPage>(`/${tenantSlug}/performance/records`, {
      params: { ...query({ ...filters, compare: false }), indicator, page, limit },
    });
    return response.data;
  },

  /** One salesperson's indicators per week or per month (FR-PRF-08). */
  fetchSeries: async (
    tenantSlug: string,
    salespersonId: string,
    period: { preset: PeriodPreset; from?: string; to?: string },
    grain: 'WEEK' | 'MONTH'
  ): Promise<PerformanceSeries> => {
    const response = await apiClient.get<PerformanceSeries>(`/${tenantSlug}/performance/series`, {
      params: { ...query({ ...period }), salespersonId, grain },
    });
    return response.data;
  },

  /** The filtered table as a file; the export is recorded in the audit log (FR-PRF-09, FR-AUD-13). */
  download: async (tenantSlug: string, filters: PerformanceFilters, format: 'csv' | 'pdf', locale: 'sq' | 'en'): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`/${tenantSlug}/performance/export`, {
      params: { ...query(filters), format, locale },
      responseType: 'blob',
    });
    return response.data;
  },
};
