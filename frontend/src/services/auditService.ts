import { apiClient as api } from '../api';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';

/** A filter group and its audited entity types, as `GET /audit/entity-types` sends them (FR-AUD-10). */
export interface AuditEntityGroup {
  group: string;
  types: string[];
}

export interface AuditChange {
  field: string;
  old: unknown;
  new: unknown;
}

/** One row, as `GET /audit` and `GET /audit/:id` send it (FR-AUD-06). */
export interface AuditEntry {
  id: string;
  at: string;
  userId: string | null;
  userRole: string;
  userName: string | null;
  roleNameSq: string | null;
  roleNameEn: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  changes: AuditChange[];
}

export interface AuditFilters {
  from?: Date;
  to?: Date;
  userId?: string;
  entityType?: string;
  entityGroup?: string;
  action?: AuditAction;
}

export interface AuditPage {
  data: AuditEntry[];
  total: number;
}

function filterParams(filters: AuditFilters) {
  return {
    from: filters.from?.toISOString(),
    to: filters.to?.toISOString(),
    userId: filters.userId,
    entityType: filters.entityType,
    entityGroup: filters.entityGroup,
    action: filters.action,
  };
}

/** The audit log viewer's client (Slice 7: FR-AUD-06, 08). */
export const auditService = {
  search: async (tenantSlug: string, filters: AuditFilters, page: number, limit: number): Promise<AuditPage> => {
    const response = await api.get<AuditPage>(`/${tenantSlug}/audit`, {
      params: { ...filterParams(filters), page, limit },
    });
    return response.data;
  },

  entityTypes: async (tenantSlug: string): Promise<AuditEntityGroup[]> => {
    const response = await api.get<{ groups: AuditEntityGroup[] }>(`/${tenantSlug}/audit/entity-types`);
    return response.data.groups;
  },

  get: async (tenantSlug: string, id: string): Promise<AuditEntry> => {
    const response = await api.get<{ entry: AuditEntry }>(`/${tenantSlug}/audit/${id}`);
    return response.data.entry;
  },

  downloadCsv: async (tenantSlug: string, filters: AuditFilters): Promise<Blob> => {
    const response = await api.get<Blob>(`/${tenantSlug}/audit/export.csv`, {
      params: filterParams(filters),
      responseType: 'blob',
    });
    return response.data;
  },
};
