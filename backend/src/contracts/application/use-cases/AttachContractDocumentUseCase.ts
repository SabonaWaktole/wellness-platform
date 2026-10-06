import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { ContractDocumentStore } from '../../infrastructure/ContractDocumentStore';
import { ContractDocument } from '../../domain/ContractDocument';
import { ContractStatus } from '../../domain/Contract';
import { ContractValidationError } from '../../domain/contractErrors';
import { reachableContract } from './contractAccess';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { contractLabel } from './contractAudit';

/** A term that is over keeps the document it was signed with. */
const CLOSED = [ContractStatus.Expired, ContractStatus.Cancelled];

/**
 * Attaches the signed contract PDF, or replaces it (FR-CON-19). The earlier
 * file stays on disk and in the version list, with the date and the user that
 * uploaded it; the new one becomes current. Nothing removes a document: it is
 * a legal record.
 *
 * The file is checked by its content (a PDF's first bytes), written BEFORE the
 * transaction opens, and deleted again only if the transaction fails, so a
 * rolled-back upload leaves no orphan and a committed one leaves no dangling
 * row.
 */
export class AttachContractDocumentUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private documentStore: ContractDocumentStore,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    file: { originalName: string; buffer: Buffer };
    actingUserId: string;
    access: AccessContext;
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    let stored;
    try {
      stored = await this.documentStore.store(input.tenantId, input.file.originalName, input.file.buffer);
    } catch (error) {
      throw new ContractValidationError('file', (error as Error).message);
    }

    try {
      return await this.writeTx.run(async (repos) => {
        // Out of scope reads as not found (FR-RBAC-05, 11).
        const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);
        if (CLOSED.includes(contract.status)) {
          throw new ContractValidationError('document', 'The document of a contract that has ended can no longer be replaced.');
        }

        const previous = await repos.documentRepo.findCurrent(input.tenantId, contract.id);
        const document = ContractDocument.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fileName: stored.name,
          url: stored.url,
          uploadedByUserId: input.actingUserId,
        });
        await repos.documentRepo.addCurrent(document);

        // The contract mirrors the current file for the readers that predate versions.
        contract.attachDocument(stored.url, stored.name);
        await repos.contractRepo.save(contract);

        await repos.auditTrail.record({
          tenantId: input.tenantId,
          userId: input.actingUserId,
          userRole: input.access.auditRole,
          action: AuditAction.Update,
          entityType: 'Contract',
          entityId: contract.id,
          entityLabel: contractLabel(contract),
          changes: [{ field: 'document', old: previous?.fileName ?? null, new: document.fileName }],
        });

        return { contract, document };
      });
    } catch (error) {
      // The row was never written, so the file just stored is an orphan.
      await this.documentStore.remove(stored.url);
      throw error;
    }
  }
}
