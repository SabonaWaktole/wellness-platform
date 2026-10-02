import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { LookupValueTakenError } from '../../domain/errors';
import { LookupList } from '../../domain/LookupList';
import { findNameClash, lookupLabels, LookupRecord, nextOrder } from '../../domain/LookupItem';
import { auditedFields, auditFieldsOf, ensureCanManageList, lookupAuditEntry, pickFields } from '../lookupAdmin';
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
    ensureCanManageList(input.access, input.list);
    const rules = this.rules[input.list];

    const labels = lookupLabels(input.values);
    const fields = pickFields(input.values, rules.fields);
    const siblings = await this.store.list(input.tenantId, input.list);
    // The candidate's own fields (a city's areaId) decide which siblings its
    // name and order are scoped to (FR-SET-04); `order` is not among them, so
    // it is not needed yet.
    const candidate: LookupRecord = { id: '', ...labels, ...fields, order: 0, active: true };
    const peers = rules.namePeers(candidate, siblings);
    if (findNameClash(peers, labels)) {
      throw new LookupValueTakenError('nameSq');
    }

    const item: LookupRecord = { ...candidate, id: randomUUID(), order: nextOrder(peers) };
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
