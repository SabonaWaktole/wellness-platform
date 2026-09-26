import { ContractStatusHistory } from './ContractStatusHistory';

export interface IContractStatusHistoryRepository {
  findByContractId(tenantId: string, contractId: string): Promise<ContractStatusHistory[]>;
  save(history: ContractStatusHistory): Promise<void>;
}
