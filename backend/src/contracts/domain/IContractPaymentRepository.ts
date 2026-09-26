import { ContractPayment } from './ContractPayment';

export interface IContractPaymentRepository {
  findById(tenantId: string, id: string): Promise<ContractPayment | null>;
  findByContractId(tenantId: string, contractId: string): Promise<ContractPayment[]>;
  save(payment: ContractPayment): Promise<void>;
  /** Used by activation, which writes a whole generated schedule at once. */
  saveMany(payments: ContractPayment[]): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}
