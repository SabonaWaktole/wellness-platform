import { IClientRepository, ClientRelatedCounts } from '../../domain/repositories/IClientRepository';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';

interface ArchiveClientDTO {
  tenantId: string;
  requestingUserRole: string;
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
 */
export class ArchiveClientUseCase {
  constructor(private clientRepo: IClientRepository) {}

  async execute(dto: ArchiveClientDTO): Promise<ArchiveClientResult> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER && dto.requestingUserRole !== UserRole.SUPER_ADMIN) {
      throw new DomainError('Only Business Owners can delete clients');
    }

    // Not includeArchived: archiving an already-archived client is a no-op the
    // caller should hear about, not a silent success.
    const existing = await this.clientRepo.findById(dto.tenantId, dto.clientId);
    if (!existing) {
      throw new DomainError('Client not found');
    }

    const preserved = await this.clientRepo.countRelatedRecords(dto.tenantId, dto.clientId);
    await this.clientRepo.archive(dto.tenantId, dto.clientId, dto.requestingUserId);

    return { archivedClientName: existing.name, preserved };
  }
}
