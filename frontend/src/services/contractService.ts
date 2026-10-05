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
  /** Instalments (M3 Slice 8). Every write needs `payments.update`; the server decides. */
  fetchPaymentHistory: async (tenantSlug: string, id: string, paymentId: string) => {
    const response = await apiClient.get(`/${tenantSlug}/contracts/${id}/payments/${paymentId}/history`);
    return response.data.history;
  },
  addPayment: async (tenantSlug: string, id: string, data: { dueDate: string; amount: string; reason: string; note?: string | null }) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/payments`, data);
    return response.data;
  },
  updatePayment: async (
    tenantSlug: string,
    id: string,
    paymentId: string,
    data: { dueDate?: string; amount?: string; note?: string | null; reason?: string }
  ) => {
    const response = await apiClient.patch(`/${tenantSlug}/contracts/${id}/payments/${paymentId}`, data);
    return response.data;
  },
  deletePayment: async (tenantSlug: string, id: string, paymentId: string, reason: string) => {
    const response = await apiClient.delete(`/${tenantSlug}/contracts/${id}/payments/${paymentId}`, { data: { reason } });
    return response.data;
  },
  /** One POST per instalment action: `invoice`, `pending`, `receipts`, `receipts/reverse` or `correct`. */
  paymentAction: async (tenantSlug: string, id: string, paymentId: string, action: string, data?: object) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/payments/${paymentId}/${action}`, data ?? {});
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
  /** FR-CON-11: one call for every status change; the server checks the move, the permission and the reason. */
  changeStatus: async (tenantSlug: string, id: string, status: string, reason?: string) => {
    const response = await apiClient.post(`/${tenantSlug}/contracts/${id}/status`, { status, reason });
    return response.data;
  },
  /**
   * A signed document is read through the API, which checks the permission and the
   * contract's scope (FR-CON-19); it is not a public file.
   */
  downloadDocument: async (tenantSlug: string, id: string, documentId: string): Promise<Blob> => {
    const response = await apiClient.get(`/${tenantSlug}/contracts/${id}/documents/${documentId}/download`, { responseType: 'blob' });
    return response.data;
  },
};
