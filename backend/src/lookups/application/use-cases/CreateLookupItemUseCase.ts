import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { LookupValueTakenError } from '../../domain/errors';
import { LookupList } from '../../domain/LookupList';
import { findNameClash, lookupLabels, LookupRecord, nextOrder } from '../../domain/LookupItem';
import { auditedFields, auditFieldsOf, lookupAuditEntry, MANAGE_LISTS, pickFields } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupStore } from '../ports/ILookupStore';
import { ILookupWriteTransaction } from '../ports/ILookupWriteTransaction';

export interface LookupValuesInput {
  nameSq: string;
  nameEn?: string | null;
  [field: string]: unknown;
}

/** Adds a value at the end of a list. It is active, so it is offered straight away (FR-SET-01). */
export class CreateLookupItemUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry,
    private readonly writeTx: ILookupWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: LookupList; values: LookupValuesInput }): Promise<LookupRecord> {
    input.access.ensure(MANAGE_LISTS);
    const rules = this.rules[input.list];

    const labels = lookupLabels(input.values);
    const siblings = await this.store.list(input.tenantId, input.list);
    if (findNameClash(siblings, labels)) {
      throw new LookupValueTakenError('nameSq');
    }

    const item: LookupRecord = {
      ...pickFields(input.values, rules.fields),
      id: randomUUID(),
      ...labels,
      order: nextOrder(siblings),
      active: true,
    };
    await rules.validate(input.tenantId, item, null, siblings);

    const after = await auditFieldsOf(rules, input.tenantId, item);
    const changes = auditedFields(rules).map((field) => ({ field, old: null, new: after[field] ?? null }));

    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      await lookups.create(input.tenantId, input.list, item);
      await auditTrail.record(lookupAuditEntry(input.access, input.tenantId, input.list, item, AuditAction.Create, changes));
    });
    return item;
  }
}
