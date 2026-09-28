import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { LookupList } from '../../domain/LookupList';
import { LookupRecord } from '../../domain/LookupItem';
import { findItem, lookupAuditEntry, MANAGE_LISTS } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupStore } from '../ports/ILookupStore';
import { ILookupWriteTransaction } from '../ports/ILookupWriteTransaction';

/**
 * Deactivates or reactivates a value. A deactivated value stays on the
 * records that use it but is no longer offered for new ones (FR-SET-01, 02).
 */
export class SetLookupItemActiveUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry,
    private readonly writeTx: ILookupWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: LookupList; id: string; active: boolean }): Promise<LookupRecord> {
    input.access.ensure(MANAGE_LISTS);
    const rules = this.rules[input.list];
    const current = await findItem(this.store, input.tenantId, input.list, input.id);
    if (current.active === input.active) {
      return current;
    }

    if (input.active) {
      await rules.checkReactivate(input.tenantId, current);
    } else {
      await rules.checkDeactivate(input.tenantId, current);
    }

    const next = { ...current, active: input.active };
    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      await lookups.update(input.tenantId, input.list, next);
      await auditTrail.record(
        lookupAuditEntry(input.access, input.tenantId, input.list, next, AuditAction.StatusChange, [
          { field: 'active', old: current.active, new: next.active },
        ])
      );
    });
    return next;
  }
}
