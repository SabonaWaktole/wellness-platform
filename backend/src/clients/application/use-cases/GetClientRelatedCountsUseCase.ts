import { IClientRepository, ClientRelatedCounts } from '../../domain/repositories/IClientRepository';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

/** Backs the archive confirmation dialog: tells the owner what the client is
 *  attached to before they act. Read-only, so it needs only the company to be
 *  inside the viewer's `companies.view` scope. */
export class GetClientRelatedCountsUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(tenantId: string, clientId: string, access: AccessContext): Promise<ClientRelatedCounts> {
    const scope = await this.scopes.resolve(access, 'companies.view');
    const existing = await this.clientRepo.findById(tenantId, clientId, { scope });
    if (!existing) {
      throw new DomainError('Client not found');
    }
    return this.clientRepo.countRelatedRecords(tenantId, clientId);
  }
}
