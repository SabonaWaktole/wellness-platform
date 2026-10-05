import { apiClient as api } from '../api';

export interface ContractSettings {
  reminderLeadDays: number[];
  expiringSoonDays: number;
  paymentGraceDays: number;
  numberPrefix: string;
}

/** The contract settings API (M3 Slice 3), under `settings.manage`. */
export const contractSettingsService = {
  get: async (tenantSlug: string): Promise<ContractSettings> =>
    (await api.get<{ data: ContractSettings }>(`/${tenantSlug}/settings/contracts`)).data.data,

  update: async (tenantSlug: string, patch: Partial<ContractSettings>): Promise<ContractSettings> =>
    (await api.patch<{ data: ContractSettings }>(`/${tenantSlug}/settings/contracts`, patch)).data.data,
};
