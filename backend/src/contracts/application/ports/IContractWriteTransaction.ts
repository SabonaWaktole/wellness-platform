import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { IContractDocumentRepository } from '../../domain/IContractDocumentRepository';
import { IContractCompanyStatus } from './IContractCompanyStatus';
import { IContractSettingsStore } from './IContractSettingsStore';
import { IContractNumbers } from './IContractNumbers';
import { IContractDealSource } from './IContractDealSource';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';

/** The repositories a contract write goes through, all on one connection. */
export interface ContractWriteRepos {
  contractRepo: IContractRepository;
  paymentRepo: IContractPaymentRepository;
  historyRepo: IContractStatusHistoryRepository;
  /** The workspace's contract settings, written with their audit entry (M3 Slice 3). */
  settingsStore: IContractSettingsStore;
  /** The next contract number (M3 Slice 4, FR-CON-05), taken under a row lock in this transaction. */
  numbers: IContractNumbers;
  /** Reads the won deal and offer a contract is filled from (M3 Slice 4, FR-CON-03). */
  deals: IContractDealSource;
  /** The signed document and its previous versions (M3 Slice 5, FR-CON-19). */
  documentRepo: IContractDocumentRepository;
  /** Sets the company to Client when a contract is activated (M3 Slice 5, FR-CON-13). */
  companyStatus: IContractCompanyStatus;
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
