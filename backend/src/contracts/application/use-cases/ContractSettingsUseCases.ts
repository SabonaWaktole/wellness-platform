import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditChange } from '../../../audit/domain/AuditChange';
import { ContractSettings, ContractSettingsValues } from '../../domain/ContractSettings';
import { IContractSettingsStore } from '../ports/IContractSettingsStore';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';

/** Workspace settings are the Administrator's (SRS M3 §7.2, plan D17): the existing key, no new one. */
export const MANAGE_SETTINGS = 'settings.manage';

export class GetContractSettingsUseCase {
  constructor(private readonly store: IContractSettingsStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<ContractSettings> {
    input.access.ensure(MANAGE_SETTINGS);
    return this.store.get(input.tenantId);
  }
}

/**
 * FR-REN-01, FR-REN-04, FR-PAY-09, FR-CON-05: sets the reminder lead times, the
 * expiring-soon window, the payment grace days and the number prefix. Only the
 * fields sent change. One audit entry with the changed fields' old and new
 * values, written in the same transaction as the change (FR-AUD-11). Saving
 * values that equal the current ones writes nothing.
 */
export class UpdateContractSettingsUseCase {
  constructor(
    private readonly store: IContractSettingsStore,
    private readonly writeTx: IContractWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; patch: Partial<ContractSettingsValues> }): Promise<ContractSettings> {
    input.access.ensure(MANAGE_SETTINGS);
    const current = await this.store.get(input.tenantId);
    const next = current.with(input.patch);

    const before = current.toJSON();
    const after = next.toJSON();
    const changes: AuditChange[] = (Object.keys(after) as (keyof ContractSettingsValues)[])
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map((field) => ({ field, old: before[field], new: after[field] }));
    if (changes.length === 0) return current;

    await this.writeTx.run(async ({ settingsStore, auditTrail }) => {
      await settingsStore.save(next, input.access.userId);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'ContractSettings',
        entityId: input.tenantId,
        entityLabel: null,
        changes,
      });
    });
    return next;
  }
}
