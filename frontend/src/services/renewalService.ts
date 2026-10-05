import { apiClient } from '../api';
import type { RenewalFilters, RenewalsPage } from '../types/renewal';

const clean = (filters: RenewalFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));

export const renewalService = {
  /** The Renewals screen (FR-REN-05). The server applies the viewer's scope and works out each row's state. */
  fetchRenewals: async (tenantSlug: string, filters: RenewalFilters, page: number, limit: number): Promise<RenewalsPage> => {
    const response = await apiClient.get<RenewalsPage>(`/${tenantSlug}/renewals`, { params: { ...clean(filters), page, limit } });
    return response.data;
  },
  /** FR-REN-08: no further reminders for the contract; the reason is one of the lost-deal reasons. */
  markNotRenewing: async (tenantSlug: string, contractId: string, data: { reasonId: string; note?: string | null }): Promise<void> => {
    await apiClient.post(`/${tenantSlug}/contracts/${contractId}/not-renewing`, data);
  },
  /** Takes the mark back, so reminders and the renewal state follow the contract again. */
  clearNotRenewing: async (tenantSlug: string, contractId: string): Promise<void> => {
    await apiClient.delete(`/${tenantSlug}/contracts/${contractId}/not-renewing`);
  },
};
