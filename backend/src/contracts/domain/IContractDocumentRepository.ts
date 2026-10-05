import { ContractDocument } from './ContractDocument';

export interface IContractDocumentRepository {
  /** Every version of a contract's document, newest first. */
  findByContractId(tenantId: string, contractId: string): Promise<ContractDocument[]>;
  findById(tenantId: string, contractId: string, id: string): Promise<ContractDocument | null>;
  findCurrent(tenantId: string, contractId: string): Promise<ContractDocument | null>;
  /** Makes `document` the current version and every other version of the contract a previous one. */
  addCurrent(document: ContractDocument): Promise<void>;
}
