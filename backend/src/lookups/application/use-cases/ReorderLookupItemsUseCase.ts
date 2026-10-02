import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { InvalidLookupOrderError } from '../../domain/errors';
import { LookupList } from '../../domain/LookupList';
import { LookupRecord, sortLookupItems } from '../../domain/LookupItem';
import { allowedFilter, ensureCanManageList, lookupAuditEntry } from '../lookupAdmin';
import { LookupRulesRegistry } from '../LookupListRules';
import { ILookupStore } from '../ports/ILookupStore';
import { ILookupWriteTransaction } from '../ports/ILookupWriteTransaction';

/**
 * Puts a list, or the slice of it named by `filter` (a City's area,
 * FR-SET-04), in the order given by `ids`, which must name every one of
 * those values (inactive ones too) exactly once. Each value that moved gets
 * its own audit entry, so the log for one value shows its whole history.
 */
export class ReorderLookupItemsUseCase {
  constructor(
    private readonly store: ILookupStore,
    private readonly rules: LookupRulesRegistry,
    private readonly writeTx: ILookupWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: LookupList;
    ids: string[];
    filter?: Record<string, unknown>;
  }): Promise<LookupRecord[]> {
    ensureCanManageList(input.access, input.list);

    const items = await this.store.list(input.tenantId, input.list, allowedFilter(this.rules[input.list], input.filter));
    const byId = new Map(items.map((item) => [item.id, item]));
    if (input.ids.length !== items.length || new Set(input.ids).size !== items.length || !input.ids.every((id) => byId.has(id))) {
      throw new InvalidLookupOrderError();
    }

    const reordered = input.ids.map((id, index) => ({ ...byId.get(id)!, order: index + 1 }));
    const moved = reordered.filter((item) => item.order !== byId.get(item.id)!.order);
    if (moved.length === 0) {
      return sortLookupItems(items);
    }

    await this.writeTx.run(async ({ lookups, auditTrail }) => {
      for (const item of moved) {
        await lookups.update(input.tenantId, input.list, item);
        await auditTrail.record(
          lookupAuditEntry(input.access, input.tenantId, input.list, item, AuditAction.Update, [
            { field: 'order', old: byId.get(item.id)!.order, new: item.order },
          ])
        );
      }
    });
    return reordered;
  }
}
