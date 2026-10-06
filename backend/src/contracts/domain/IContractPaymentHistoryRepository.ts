import { ContractPaymentHistoryEntry } from './ContractPaymentHistory';

export interface IContractPaymentHistoryRepository {
  /** Oldest first: an instalment's history is read as a story. */
  findByPaymentId(tenantId: string, paymentId: string): Promise<ContractPaymentHistoryEntry[]>;
  save(entry: ContractPaymentHistoryEntry): Promise<void>;
}
