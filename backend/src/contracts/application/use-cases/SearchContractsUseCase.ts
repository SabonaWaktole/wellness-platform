import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { ContractStatus } from '../../domain/Contract';

/**
 * The contracts list, and the renewals worklist behind the same endpoint.
 *
 * Staff are narrowed to their own accounts here rather than being filtered out
 * after the fact, so pagination counts stay honest — a page of ten showing
 * three rows because seven were dropped post-query is the bug this avoids.
 */
export class SearchContractsUseCase {
  constructor(private contractRepo: IContractRepository) {}

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
    const assignedUserId =
      input.access.ownOnly('contracts.validity.view')
        ? input.access.userId
        : input.params.assignedUserId;

    return this.contractRepo.search({
      tenantId: input.tenantId,
      query: input.params.query,
      status: input.params.status,
      clientId: input.params.clientId,
      assignedUserId,
      expiringWithinDays: input.params.expiringWithinDays,
      page: input.params.page || 1,
      limit: input.params.limit || 10,
    });
  }
}
