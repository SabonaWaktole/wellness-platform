import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { Client } from '../../domain/entities/Client';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

export class GetClientUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver
  ) {}

  /** A company outside the viewer's `companies.view` scope is "not found" (FR-RBAC-05, 11). */
  async execute(tenantId: string, clientId: string, access: AccessContext): Promise<Client> {
    const scope = await this.scopes.resolve(access, 'companies.view');
    const client = await this.clientRepo.findById(tenantId, clientId, { scope });
    if (!client || client.tenantId !== tenantId) {
      throw new DomainError('Client not found');
    }
    return client;
  }
}
