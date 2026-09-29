import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IClientWriteTransaction } from '../ports/IClientWriteTransaction';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AuditAction } from '../../../audit/domain/AuditAction';

interface RestoreClientDTO {
  tenantId: string;
  access: AccessContext;
  requestingUserId: string;
  clientId: string;
}

/** Brings an archived client back into the active list. Same permission as
 *  archiving — see ArchiveClientUseCase. Audited the same way (FR-AUD-02). */
export class RestoreClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver,
    private writeTx: IClientWriteTransaction
  ) {}

  async execute(dto: RestoreClientDTO): Promise<{ restoredClientName: string }> {
    dto.access.ensure('companies.delete');
    const scope = await this.scopes.resolve(dto.access, 'companies.delete');

    const existing = await this.clientRepo.findById(dto.tenantId, dto.clientId, { includeArchived: true, scope });
    if (!existing) {
      throw new DomainError('Client not found');
    }
    if (!existing.isArchived()) {
      throw new DomainError('Client is not archived');
    }

    await this.writeTx.run(async ({ clients, auditTrail }) => {
      await clients.restore(dto.tenantId, dto.clientId, dto.requestingUserId);
      await auditTrail.record({
        tenantId: dto.tenantId,
        userId: dto.access.userId,
        userRole: dto.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Client',
        entityId: dto.clientId,
        entityLabel: existing.name,
        changes: [{ field: 'deletedAt', old: 'archived', new: null }],
      });
    });

    return { restoredClientName: existing.name };
  }
}
