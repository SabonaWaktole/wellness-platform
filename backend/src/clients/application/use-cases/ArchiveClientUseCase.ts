import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository, ClientRelatedCounts } from '../../domain/repositories/IClientRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AuditAction } from '../../../audit/domain/AuditAction';

interface ArchiveClientDTO {
  tenantId: string;
  access: AccessContext;
  requestingUserId: string;
  clientId: string;
}

interface ArchiveClientResult {
  archivedClientName: string;
  /** What the archive preserved, for the confirmation message. */
  preserved: ClientRelatedCounts;
}

/**
 * Archives (soft-deletes) a client. Deliberately not a hard delete:
 * Interaction, Appointment, Quotation and Invoice each hold a non-nullable
 * clientId with no cascade rule, so removing the row is rejected by the
 * database for any client with history — and cascading would destroy issued
 * invoices, silently rewriting past revenue reports. Archiving hides the
 * client from every client-facing read while those records stay valid and
 * still resolve the client's name. Reversible via RestoreClientUseCase.
 * Audited (FR-AUD-02): if the audit write fails, the archive rolls back.
 */
export class ArchiveClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: ArchiveClientDTO): Promise<ArchiveClientResult> {
    dto.access.ensure('companies.delete');
    const scope = await this.scopes.resolve(dto.access, 'companies.delete');

    // Not includeArchived: archiving an already-archived client is a no-op the
    // caller should hear about, not a silent success.
    const existing = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!existing) {
      throw new DomainError('Client not found');
    }

    const preserved = await this.clientRepo.countRelatedRecords(dto.tenantId, dto.clientId);

    await this.writeTx.run(async ({ clients, auditTrail }) => {
      await clients.archive(dto.tenantId, dto.clientId, dto.requestingUserId);
      await auditTrail.record({
        tenantId: dto.tenantId,
        userId: dto.access.userId,
        userRole: dto.access.auditRole,
        action: AuditAction.Delete,
        entityType: 'Client',
        entityId: dto.clientId,
        entityLabel: existing.name,
        changes: [{ field: 'deletedAt', old: null, new: 'archived' }],
      });
    });

    return { archivedClientName: existing.name, preserved };
  }
}
