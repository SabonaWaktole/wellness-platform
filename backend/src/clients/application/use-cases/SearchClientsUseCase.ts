import { IClientRepository, SearchClientsFilters } from '../../domain/repositories/IClientRepository';
import { Client } from '../../domain/entities/Client';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

interface SearchClientsDTO {
  tenantId: string;
  access: AccessContext;
  filters: Omit<SearchClientsFilters, 'scope'>;
  /** The list's "mine / team / all" filter. Narrows the viewer's scope, never widens it. */
  reach?: PermissionScope;
  skip?: number;
  take?: number;
}

export class SearchClientsUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver
  ) {}

  /** Only companies inside the viewer's `companies.view` scope, counted in the query (FR-RBAC-13). */
  async execute(dto: SearchClientsDTO): Promise<{ items: Client[]; total: number }> {
    const skip = dto.skip ?? 0;
    const take = dto.take ?? 50;
    const scope = await this.scopes.resolve(dto.access, 'companies.view', dto.reach);

    return this.clientRepo.search(dto.tenantId, { ...dto.filters, scope }, skip, take);
  }
}
