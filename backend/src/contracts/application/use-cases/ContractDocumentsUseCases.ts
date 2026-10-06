import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IContractRepository } from '../../domain/IContractRepository';
import { IContractDocumentRepository } from '../../domain/IContractDocumentRepository';
import { ContractDocumentStore } from '../../infrastructure/ContractDocumentStore';
import { reachableContract } from './contractAccess';

/**
 * Reads the signed document (FR-CON-19). Both need `commercial.view`, which the
 * route requires, and access to the contract: one outside the viewer's scope
 * reads as not found.
 */
export class ContractDocumentsUseCases {
  constructor(
    private readonly contracts: IContractRepository,
    private readonly documents: IContractDocumentRepository,
    private readonly store: ContractDocumentStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async list(input: { tenantId: string; contractId: string; access: AccessContext }) {
    await this.reach(input);
    return this.documents.findByContractId(input.tenantId, input.contractId);
  }

  async download(input: { tenantId: string; contractId: string; documentId: string; access: AccessContext }) {
    await this.reach(input);
    const document = await this.documents.findById(input.tenantId, input.contractId, input.documentId);
    const bytes = document ? await this.store.read(document.url) : null;
    if (!document || !bytes) throw new Error('Document not found');
    return { fileName: document.fileName, bytes };
  }

  private async reach(input: { tenantId: string; contractId: string; access: AccessContext }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.validity.view');
    reachableContract(await this.contracts.findById(input.tenantId, input.contractId), scope);
  }
}
