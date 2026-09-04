import { apiClient } from '../api';
import type {
  Client,
  SearchClientsParams,
  PaginatedResult,
  CustomFieldDefinition,
  OutcomeCategory,
  ClientHistory,
  Interaction,
  ImportResult
} from '../types/client';

export const clientService = {
  createClient: async (tenantSlug: string, data: { customFieldValues?: Record<string, any> }) => {
    const response = await apiClient.post<Client>(`/${tenantSlug}/clients`, data);
    return response.data;
  },

  updateClient: async (tenantSlug: string, clientId: string, data: { customFieldValues?: Record<string, any> }) => {
    const response = await apiClient.put<Client>(`/${tenantSlug}/clients/${clientId}`, data);
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
