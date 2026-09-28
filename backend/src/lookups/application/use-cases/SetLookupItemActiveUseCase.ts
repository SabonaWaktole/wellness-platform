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
 *
 * Deactivating a value with `cascadesTo` values still active under it (an
 * area with active cities, FR-SET-04) is refused unless the caller passes
 * `cascade: true`, in which case those values are deactivated in the same
 * transaction, each with its own audit entry.
 */
export class SetLookupItemActiveUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry,
    private readonly writeTx: ILookupWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: LookupList;
    id: string;
    active: boolean;
    cascade?: boolean;
  }): Promise<LookupRecord> {
    input.access.ensure(MANAGE_LISTS);
    const rules = this.rules[input.list];
    const current = await findItem(this.store, input.tenantId, input.list, input.id);
    if (current.active === input.active) {
      return current;
    }

    let cascaded: LookupRecord[] = [];
    if (input.active) {
      await rules.checkReactivate(input.tenantId, current);
    } else {
      cascaded = await rules.checkDeactivate(input.tenantId, current, { cascade: input.cascade === true });
    }

    const next = { ...current, active: input.active };
    const childList = rules.cascadesTo;
    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      await lookups.update(input.tenantId, input.list, next);
      await auditTrail.record(
        lookupAuditEntry(input.access, input.tenantId, input.list, next, AuditAction.StatusChange, [
          { field: 'active', old: current.active, new: next.active },
        ])
      );
      for (const child of cascaded) {
        const nextChild = { ...child, active: false };
        await lookups.update(input.tenantId, childList!, nextChild);
        await auditTrail.record(
          lookupAuditEntry(input.access, input.tenantId, childList!, nextChild, AuditAction.StatusChange, [
            { field: 'active', old: true, new: false },
          ])
        );
      }
    });
    return next;
  }
}
