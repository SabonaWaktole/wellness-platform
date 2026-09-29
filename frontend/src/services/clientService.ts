import { apiClient } from '../api';
import type {
  Client,
  SearchClientsParams,
  PaginatedResult,
  CustomFieldDefinition,
  OutcomeCategory,
  ClientHistory,
  Interaction,
  ImportResult,
  ClientRelatedCounts,
  CompanyProfileInput,
} from '../types/client';

/** A saved client, plus non-blocking notices about the save (FR-CMP-02: a duplicate name). */
export type ClientWithWarnings = Client & { warnings: string[] };

export const clientService = {
  /** `profile` is required: the company form always sends it (FR-CMP-01, 02, 03). */
  createClient: async (
    tenantSlug: string,
    data: { customFieldValues?: Record<string, any>; notes?: string | null; profile: CompanyProfileInput }
  ) => {
    const response = await apiClient.post<ClientWithWarnings>(`/${tenantSlug}/clients`, data);
    return response.data;
  },

  /** `profile` omitted leaves the company's existing one untouched, like `notes`. */
  updateClient: async (
    tenantSlug: string,
    clientId: string,
    data: { customFieldValues?: Record<string, any>; notes?: string | null; profile?: CompanyProfileInput }
  ) => {
    const response = await apiClient.put<ClientWithWarnings>(`/${tenantSlug}/clients/${clientId}`, data);
    return response.data;
  },

  getClient: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.get<Client>(`/${tenantSlug}/clients/${clientId}`);
    return response.data;
  },

  searchClients: async (tenantSlug: string, params: SearchClientsParams) => {
    const response = await apiClient.get<PaginatedResult<Client>>(`/${tenantSlug}/clients/search`, { params });
    return response.data;
  },

  /** Soft delete: the client is archived, not removed. Related invoices,
   *  quotations, appointments and history all survive and keep resolving the
   *  client's name — see ArchiveClientUseCase on the backend. */
  archiveClient: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.delete<{ archivedClientName: string; preserved: ClientRelatedCounts }>(
      `/${tenantSlug}/clients/${clientId}`
    );
    return response.data;
  },

  restoreClient: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.post<{ restoredClientName: string }>(
      `/${tenantSlug}/clients/${clientId}/restore`
    );
    return response.data;
  },

  /** What the client is attached to — shown in the archive confirmation. */
  getClientRelatedCounts: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.get<ClientRelatedCounts>(
      `/${tenantSlug}/clients/${clientId}/related-counts`
    );
    return response.data;
  },

  getClientHistory: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.get<ClientHistory>(`/${tenantSlug}/clients/${clientId}/history`);
    return response.data;
  },

  addInteraction: async (tenantSlug: string, clientId: string, data: { type?: string; channel: string; content: string; outcomeCategoryId?: string }) => {
    const response = await apiClient.post<Interaction>(`/${tenantSlug}/clients/${clientId}/interactions`, data);
    return response.data;
  },

  getCustomFields: async (tenantSlug: string) => {
    const response = await apiClient.get<CustomFieldDefinition[]>(`/${tenantSlug}/clients/settings/custom-fields`);
    return response.data;
  },

  defineCustomField: async (tenantSlug: string, data: { fieldName: string; fieldType: string; options?: string[]; role?: string | null; required?: boolean }) => {
    const response = await apiClient.post<CustomFieldDefinition>(`/${tenantSlug}/clients/settings/custom-fields`, data);
    return response.data;
  },

  updateCustomField: async (tenantSlug: string, fieldId: string, data: { fieldName?: string; fieldType?: string; options?: string[]; role?: string | null; required?: boolean }) => {
    const response = await apiClient.patch<CustomFieldDefinition>(`/${tenantSlug}/clients/settings/custom-fields/${fieldId}`, data);
    return response.data;
  },

  deleteCustomField: async (tenantSlug: string, fieldId: string) => {
    const response = await apiClient.delete<{ deletedFieldName: string; deletedRole: string | null }>(`/${tenantSlug}/clients/settings/custom-fields/${fieldId}`);
    return response.data;
  },

  reorderCustomFields: async (tenantSlug: string, orderedFieldIds: string[]) => {
    await apiClient.post<void>(`/${tenantSlug}/clients/settings/custom-fields/reorder`, { orderedFieldIds });
  },

  /**
   * Spreadsheets are parsed server-side, so the browser only ships the raw
   * file — no CSV/Excel dependency is needed in the bundle.
   */
  importCustomFields: async (tenantSlug: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<ImportResult>(
      `/${tenantSlug}/clients/settings/custom-fields/import`,
      formData
    );
    return response.data;
  },

  importClients: async (tenantSlug: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<ImportResult>(`/${tenantSlug}/clients/import`, formData);
    return response.data;
  },

  downloadCustomFieldTemplate: async (tenantSlug: string) => {
    const response = await apiClient.get<Blob>(
      `/${tenantSlug}/clients/settings/custom-fields/template`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  /** Headers follow the tenant's current custom fields, so this is fetched fresh. */
  downloadClientTemplate: async (tenantSlug: string) => {
    const response = await apiClient.get<Blob>(`/${tenantSlug}/clients/import/template`, {
      responseType: 'blob',
    });
    return response.data;
  },

  getOutcomeCategories: async (tenantSlug: string) => {
    const response = await apiClient.get<OutcomeCategory[]>(`/${tenantSlug}/clients/settings/outcome-categories`);
    return response.data;
  },

  defineOutcomeCategory: async (tenantSlug: string, data: { label: string }) => {
    const response = await apiClient.post<OutcomeCategory>(`/${tenantSlug}/clients/settings/outcome-categories`, data);
    return response.data;
  },
};
