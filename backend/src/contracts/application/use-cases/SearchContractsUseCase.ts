import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { ContractStatus } from '../../domain/Contract';
import { IContractSettingsStore } from '../ports/IContractSettingsStore';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';

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
    private scopes: RecordScopeResolver,
    private settings: IContractSettingsStore,
    private now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    tenantId: string;
    actingUserId: string;
    access: AccessContext;
    /** The workspace's time zone: "today" for the validity filter is its day (M3 D4). */
    timezone: string;
    params: {
      query?: string;
      status?: ContractStatus;
      clientId?: string;
      assignedUserId?: string;
      expiringWithinDays?: number;
      validity?: 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID';
      endsFrom?: Date;
      endsTo?: Date;
      hasOverdue?: boolean;
      areaId?: string;
      cityId?: string;
      page?: number;
      limit?: number;
    };
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.validity.view');

    const settings = await this.settings.get(input.tenantId);
    // The workspace's day as a date at UTC midnight, the form contract dates are kept in.
    const today = new Date(`${dayKeyInZone(this.now(), input.timezone)}T00:00:00.000Z`);

    return this.contractRepo.search({
      today,
      expiringSoonDays: settings.expiringSoonDays,
      validity: input.params.validity,
      endsFrom: input.params.endsFrom,
      endsTo: input.params.endsTo,
      hasOverdue: input.params.hasOverdue,
      areaId: input.params.areaId,
      cityId: input.params.cityId,
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
