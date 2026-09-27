import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';

/** The repositories a contract write goes through, all on one connection. */
export interface ContractWriteRepos {
  contractRepo: IContractRepository;
  paymentRepo: IContractPaymentRepository;
  historyRepo: IContractStatusHistoryRepository;
  /** Same connection as the other three — see IAuditTrail for the pattern. */
  auditTrail: IAuditTrail;
}

/**
 * Runs the writes of a contract transition atomically.
 *
 * Same rationale as `IInvoiceWriteTransaction`, with one case that makes it
 * sharper here: activation writes the status change, the history row AND a
 * generated payment schedule. A failure partway through would leave an ACTIVE
 * contract with half its instalments — money the business would simply never
 * ask for. This port makes "all of it or none of it" real.
 */
export interface IContractWriteTransaction {
  run<T>(work: (repos: ContractWriteRepos) => Promise<T>): Promise<T>;
}
