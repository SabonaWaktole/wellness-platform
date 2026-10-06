import { ContractSettings } from '../../domain/ContractSettings';

/** The workspace's contract settings; the defaults until a row is saved. */
export interface IContractSettingsStore {
  get(tenantId: string): Promise<ContractSettings>;
  save(settings: ContractSettings, updatedByUserId: string | null): Promise<void>;
}
