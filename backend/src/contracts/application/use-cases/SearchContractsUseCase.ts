import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { ContractStatus } from '../../domain/Contract';

/**
 * The contracts list, and the renewals worklist behind the same endpoint.
 *
 * The viewer is narrowed to the contracts of the companies in their
 * `contracts.validity.view` scope (FR-RBAC-11) in the query rather than
 * being filtered after the fact, so pagination counts stay honest — a page of ten showing
 * three rows because seven were dropped post-query is the bug this avoids.
 */
export class SearchContractsUseCase {
  constructor(
    private contractRepo: IContractRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    actingUserId: string;
    access: AccessContext;
    params: {
      query?: string;
      status?: ContractStatus;
      clientId?: string;
      assignedUserId?: string;
      expiringWithinDays?: number;
      page?: number;
      limit?: number;
    };
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.validity.view');

    return this.contractRepo.search({
      scope,
      tenantId: input.tenantId,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      assignedUserId: input.params.assignedUserId,
      expiringWithinDays: input.params.expiringWithinDays,
      page: input.params.page || 1,
      limit: input.params.limit || 10,
    });
  }
}
