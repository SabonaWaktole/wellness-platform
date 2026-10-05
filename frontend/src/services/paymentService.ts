import { apiClient } from '../api';
import type { PaymentFilters, PaymentsPage } from '../types/payment';

/** Drops the filters that are empty, so the query string carries only what was chosen. */
const clean = (filters: PaymentFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));

export const paymentService = {
  /** The Payments overview (FR-PAY-11). The server applies the viewer's scope and works out the totals. */
  fetchPayments: async (tenantSlug: string, filters: PaymentFilters, page: number, limit: number): Promise<PaymentsPage> => {
    const response = await apiClient.get<PaymentsPage>(`/${tenantSlug}/payments`, { params: { ...clean(filters), page, limit } });
    return response.data;
  },
  /** The same filters as a CSV file; the export is recorded in the audit log (FR-PAY-14). */
  downloadCsv: async (tenantSlug: string, filters: PaymentFilters): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`/${tenantSlug}/payments/export.csv`, { params: clean(filters), responseType: 'blob' });
    return response.data;
  },
};
