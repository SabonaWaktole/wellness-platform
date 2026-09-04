import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface RestoreClientDTO {
  tenantId: string;
  requestingUserRole: string;
  requestingUserId: string;
  clientId: string;
}

/** Brings an archived client back into the active list. Same permission as
 *  archiving — see ArchiveClientUseCase. */
export class RestoreClientUseCase {
  constructor(private clientRepo: IClientRepository) {}

  async execute(dto: RestoreClientDTO): Promise<{ restoredClientName: string }> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER && dto.requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can restore clients');
    }

    const existing = await this.clientRepo.findById(dto.tenantId, dto.clientId, { includeArchived: true });
    if (!existing) {
      throw new DomainError('Client not found');
    }
    if (!existing.isArchived()) {
      throw new DomainError('Client is not archived');
    }

    await this.clientRepo.restore(dto.tenantId, dto.clientId, dto.requestingUserId);
    return { restoredClientName: existing.name };
  }
}
