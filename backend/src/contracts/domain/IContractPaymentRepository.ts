import { ContractPayment } from './ContractPayment';

export interface IContractPaymentRepository {
  findById(tenantId: string, id: string): Promise<ContractPayment | null>;
  findByContractId(tenantId: string, contractId: string): Promise<ContractPayment[]>;
  save(payment: ContractPayment): Promise<void>;
  /** Used by activation, which writes a whole generated schedule at once. */
  saveMany(payments: ContractPayment[]): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
  /**
   * Removes the contract's Not Invoiced instalments due after `day` and returns how many (FR-CON-15).
   * Anything invoiced, partly paid or paid, and anything already due, stays.
   */
  deleteNotInvoicedDueAfter(tenantId: string, contractId: string, day: Date): Promise<number>;
}
