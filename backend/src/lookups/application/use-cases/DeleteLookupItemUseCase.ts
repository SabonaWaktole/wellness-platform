import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { LookupItemInUseError } from '../../domain/errors';
import { LookupList } from '../../domain/LookupList';
import { auditedFields, auditFieldsOf, ensureCanManageList, findItem, lookupAuditEntry } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupInUsePolicy } from '../ports/ILookupInUsePolicy';
import { ILookupStore } from '../ports/ILookupStore';
import { ILookupWriteTransaction } from '../ports/ILookupWriteTransaction';

/** Deletes a value nothing uses. A value in use can only be deactivated (FR-SET-01, 02). */
export class DeleteLookupItemUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry,
    private readonly inUse: ILookupInUsePolicy,
    private readonly writeTx: ILookupWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: LookupList; id: string }): Promise<void> {
    ensureCanManageList(input.access, input.list);
    const rules = this.rules[input.list];
    const item = await findItem(this.store, input.tenantId, input.list, input.id);

    const usages = await this.inUse.usages(input.tenantId, input.list, item.id);
    if (usages > 0) {
      throw new LookupItemInUseError(usages);
    }

    const before = await auditFieldsOf(rules, input.tenantId, item);
    const changes = auditedFields(rules).map((field) => ({ field, old: before[field] ?? null, new: null }));

    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      await lookups.delete(input.tenantId, input.list, item.id);
      await auditTrail.record(lookupAuditEntry(input.access, input.tenantId, input.list, item, AuditAction.Delete, changes));
    });
  }
}
