import { apiClient } from '../api';

export const contractService = {
  fetchContracts: async (tenantSlug: string, params: any) => {
    const response = await apiClient.get(`/${tenantSlug}/contracts`, { params });
    return response.data;
  },
  fetchContractDetail: async (tenantSlug: string, id: string) => {
    const response = await apiClient.get(`/${tenantSlug}/contracts/${id}`);
    return response.data;
  },
  fetchClientContracts: async (tenantSlug: string, clientId: string) => {
    const response = await apiClient.get(`/${tenantSlug}/contracts/client/${clientId}`);
    return response.data;
  },
  createContract: async (tenantSlug: string, data: any) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts`, data);
    return response.data;
  },
  /** FR-CON-01: the contract is read from the won deal; nothing but the dates and billing period can be sent. */
  createContractFromDeal: async (tenantSlug: string, dealId: string) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts`, { dealId });
    return response.data;
  },
  updateContract: async (tenantSlug: string, id: string, data: any) => {
    const response = await apiClient.patch(`/${tenantSlug}/contracts/${id}`, data);
    return response.data;
  },
  performAction: async (tenantSlug: string, id: string, action: string, data?: any) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/${action}`, data ?? {});
    return response.data;
  },
  addPayment: async (tenantSlug: string, id: string, data: any) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/payments`, data);
    return response.data;
  },
  updatePayment: async (tenantSlug: string, id: string, paymentId: string, data: any) => {
    const response = await apiClient.patch(`/${tenantSlug}/contracts/${id}/payments/${paymentId}`, data);
    return response.data;
  },
  recordPayment: async (tenantSlug: string, id: string, paymentId: string, data: any) => {
    const response = await apiClient.post(
      `/${tenantSlug}/contracts/${id}/payments/${paymentId}/record`,
      data
    );
    return response.data;
  },
  deletePayment: async (tenantSlug: string, id: string, paymentId: string) => {
    const response = await apiClient.delete(`/${tenantSlug}/contracts/${id}/payments/${paymentId}`);
    return response.data;
  },
  /**
   * Multipart upload. The Content-Type header is left for the browser to set,
   * because it has to carry the multipart boundary — setting it by hand is how
   * the body arrives unparseable on the server.
   */
  uploadDocument: async (tenantSlug: string, id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/document`, form);
    return response.data;
  },
  removeDocument: async (tenantSlug: string, id: string) => {
    const response = await apiClient.delete(`/${tenantSlug}/contracts/${id}/document`);
    return response.data;
  },
};
