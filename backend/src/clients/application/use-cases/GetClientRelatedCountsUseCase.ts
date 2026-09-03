import { IClientRepository, ClientRelatedCounts } from '../../domain/repositories/IClientRepository';
import { DomainError } from '../../../shared/domain/errors/DomainError';

/** Backs the archive confirmation dialog: tells the owner what the client is
 *  attached to before they act. Read-only, so no role restriction beyond the
 *  tenant scoping every client route already applies. */
export class GetClientRelatedCountsUseCase {
  constructor(private clientRepo: IClientRepository) {}

  async execute(tenantId: string, clientId: string): Promise<ClientRelatedCounts> {
    const existing = await this.clientRepo.findById(tenantId, clientId);
    if (!existing) {
      throw new DomainError('Client not found');
    }
    return this.clientRepo.countRelatedRecords(tenantId, clientId);
  }
}
