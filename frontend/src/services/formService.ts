import { apiClient } from '../api';
import type {
  ClientFormResponse,
  ClientFormSummary,
  FormDocument,
  FormStatus,
  FormVersionSummary,
  FormVersionDetail,
  FormSubmissionSummary,
  FormSubmissionDetail,
} from '../types/form';

export interface UploadedFormAsset {
  url: string;
  width: number;
  height: number;
}

/**
 * Client intake forms. Tenant-scoped like every other service here.
 *
 * `getDefaultForm` is what the client create/edit page reads; the backend seeds
 * the tenant's starter form on that first call, so there is no separate
 * provisioning step.
 */
export const formService = {
  listForms: async (tenantSlug: string) => {
    const response = await apiClient.get<ClientFormSummary[]>(`/${tenantSlug}/forms`);
    return response.data;
  },

  createForm: async (tenantSlug: string, name: string, description?: string) => {
    const response = await apiClient.post<ClientFormSummary>(`/${tenantSlug}/forms`, { name, description });
    return response.data;
  },

  updateSettings: async (
    tenantSlug: string,
    formId: string,
    changes: { name?: string; description?: string | null; status?: FormStatus; isDefault?: boolean },
    expectedVersion: number
  ) => {
    const response = await apiClient.patch<ClientFormSummary>(`/${tenantSlug}/forms/${formId}`, {
      ...changes,
      expectedVersion,
    });
    return response.data;
  },

  duplicateForm: async (tenantSlug: string, formId: string, name: string) => {
    const response = await apiClient.post<ClientFormSummary>(`/${tenantSlug}/forms/${formId}/duplicate`, { name });
    return response.data;
  },

  listTemplates: async (tenantSlug: string) => {
    const response = await apiClient.get<ClientFormSummary[]>(`/${tenantSlug}/forms/templates`);
    return response.data;
  },

  saveAsTemplate: async (tenantSlug: string, formId: string, name: string) => {
    const response = await apiClient.post<ClientFormSummary>(`/${tenantSlug}/forms/${formId}/save-as-template`, {
      name,
    });
    return response.data;
  },

  createFormFromTemplate: async (tenantSlug: string, templateId: string, name: string) => {
    const response = await apiClient.post<ClientFormSummary>(
      `/${tenantSlug}/forms/templates/${templateId}/instantiate`,
      { name }
    );
    return response.data;
  },

  deleteForm: async (tenantSlug: string, formId: string) => {
    await apiClient.delete(`/${tenantSlug}/forms/${formId}`);
  },

  getDefaultForm: async (tenantSlug: string) => {
    const response = await apiClient.get<ClientFormResponse>(`/${tenantSlug}/forms/default`);
    return response.data;
  },

  getForm: async (tenantSlug: string, formId: string) => {
    const response = await apiClient.get<ClientFormResponse>(`/${tenantSlug}/forms/${formId}`);
    return response.data;
  },

  /**
   * `expectedVersion` is the `version` the builder loaded. The server refuses
   * with 409 if another session saved in the meantime, rather than letting one
   * owner's whole layout silently overwrite the other's.
   */
  updateLayout: async (
    tenantSlug: string,
    formId: string,
    layout: FormDocument,
    expectedVersion: number
  ) => {
    const response = await apiClient.put<ClientFormResponse>(
      `/${tenantSlug}/forms/${formId}/layout`,
      { layout, expectedVersion }
    );
    return response.data;
  },

  /**
   * Freezes the current draft as a new, immutable published version and
   * points the form at it — the same `expectedVersion` compare-and-set
   * discipline as every other form mutation.
   */
  publishForm: async (tenantSlug: string, formId: string, expectedVersion: number) => {
    const response = await apiClient.post<{ form: ClientFormSummary; version: FormVersionSummary }>(
      `/${tenantSlug}/forms/${formId}/publish`,
      { expectedVersion }
    );
    return response.data;
  },

  listVersions: async (tenantSlug: string, formId: string) => {
    const response = await apiClient.get<FormVersionSummary[]>(`/${tenantSlug}/forms/${formId}/versions`);
    return response.data;
  },

  getVersion: async (tenantSlug: string, formId: string, versionNumber: number) => {
    const response = await apiClient.get<FormVersionDetail>(
      `/${tenantSlug}/forms/${formId}/versions/${versionNumber}`
    );
    return response.data;
  },

  listSubmissions: async (tenantSlug: string, formId: string) => {
    const response = await apiClient.get<FormSubmissionSummary[]>(`/${tenantSlug}/forms/${formId}/submissions`);
    return response.data;
  },

  getSubmission: async (tenantSlug: string, formId: string, submissionId: string) => {
    const response = await apiClient.get<FormSubmissionDetail>(
      `/${tenantSlug}/forms/${formId}/submissions/${submissionId}`
    );
    return response.data;
  },

  uploadAsset: async (tenantSlug: string, formId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<UploadedFormAsset>(
      `/${tenantSlug}/forms/${formId}/assets`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
};
