import { AccessContext } from '../../../access/domain/AccessContext';
import { SalesSettings } from '../../domain/SalesSettings';
import { ISalesSettingsStore } from '../ports/ISalesSettingsStore';

/** Workspace settings are the Administrator's (FR-RBAC-05). */
export const MANAGE_SETTINGS = 'settings.manage';

export class GetSalesSettingsUseCase {
  constructor(private readonly store: ISalesSettingsStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<SalesSettings> {
    input.access.ensure(MANAGE_SETTINGS);
    return this.store.get(input.tenantId);
  }
}

/** FR-DEAL-12: the days without activity after which a deal is highlighted. */
export class UpdateSalesSettingsUseCase {
  constructor(private readonly store: ISalesSettingsStore) {}

  async execute(input: { access: AccessContext; tenantId: string; patch: { staleDealDays?: number } }): Promise<SalesSettings> {
    input.access.ensure(MANAGE_SETTINGS);
    const next = (await this.store.get(input.tenantId)).with(input.patch);
    await this.store.save(next);
    return next;
  }
}
