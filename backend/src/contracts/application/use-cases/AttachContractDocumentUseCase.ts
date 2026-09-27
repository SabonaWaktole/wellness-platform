import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { ContractDocumentStore } from '../../infrastructure/ContractDocumentStore';
import { assertCanAccessContract } from './contractAccess';

/**
 * Attaches (or clears) the signed contract PDF.
 *
 * The file is written to disk BEFORE the transaction opens and the old one is
 * deleted AFTER it commits. Both orderings are deliberate: a write that fails
 * must not leave a row pointing at a file that was never created, and a
 * transaction that rolls back must not have already deleted the document the
 * row still references.
 */
export class AttachContractDocumentUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private documentStore: ContractDocumentStore
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    file?: { originalName: string; buffer: Buffer };
    actingUserId: string;
    access: AccessContext;
  }) {
    const stored = input.file
      ? await this.documentStore.store(input.tenantId, input.file.originalName, input.file.buffer)
      : null;

    const { contract, replacedUrl } = await this.writeTx.run(async (repos) => {
      const found = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!found) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(found, input.access);

      const previousUrl = found.documentUrl;

      if (stored) found.attachDocument(stored.url, stored.name);
      else found.clearDocument();

      await repos.contractRepo.save(found);
      return { contract: found, replacedUrl: previousUrl };
    }).catch(async (error) => {
      // The row was never updated, so the file just written is an orphan.
      // Clearing it here is what stops a rejected upload from accumulating on
      // disk forever.
      if (stored) await this.documentStore.remove(stored.url);
      throw error;
    });

    if (replacedUrl && replacedUrl !== contract.documentUrl) {
      await this.documentStore.remove(replacedUrl);
    }

    return { contract };
  }
}
