import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { LookupValueTakenError } from '../../domain/errors';
import { LookupList } from '../../domain/LookupList';
import { findNameClash, lookupLabels, LookupRecord } from '../../domain/LookupItem';
import { auditedFields, auditFieldsOf, findItem, lookupAuditEntry, MANAGE_LISTS, pickFields } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupStore } from '../ports/ILookupStore';
import { ILookupWriteTransaction } from '../ports/ILookupWriteTransaction';

/**
 * Edits a value's labels and list-specific fields, e.g. moves a business type
 * to another risk level (UAT-3 step 1). Omitted fields keep their value. Order
 * and active have their own use cases.
 */
export class UpdateLookupItemUseCase {
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
    values: Record<string, unknown>;
  }): Promise<LookupRecord> {
    input.access.ensure(MANAGE_LISTS);
    const rules = this.rules[input.list];
    const current = await findItem(this.store, input.tenantId, input.list, input.id);

    const labels = lookupLabels({
      nameSq: 'nameSq' in input.values ? (input.values.nameSq as string) : current.nameSq,
      nameEn: 'nameEn' in input.values ? (input.values.nameEn as string | null) : current.nameEn,
    });
    const siblings = await this.store.list(input.tenantId, input.list);
    if (findNameClash(siblings, labels, current.id)) {
      throw new LookupValueTakenError('nameSq');
    }

    const next: LookupRecord = { ...current, ...pickFields(input.values, rules.fields), ...labels };
    await rules.validate(input.tenantId, next, current, siblings);

    const changes = diff(
      await auditFieldsOf(rules, input.tenantId, current),
      await auditFieldsOf(rules, input.tenantId, next),
      auditedFields(rules)
    );
    if (changes.length === 0) {
      return current;
    }

    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      await lookups.update(input.tenantId, input.list, next);
      await auditTrail.record(lookupAuditEntry(input.access, input.tenantId, input.list, next, AuditAction.Update, changes));
    });
    return next;
  }
}
