import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { InvalidPricingOrderError } from '../../domain/errors';
import { PricingItem, PricingList } from '../../domain/PricingLists';
import { listItemTarget, MANAGE_PRICING, pricingAuditEntry, rulesFor } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Puts the visit frequencies or the price zones in the order the pricing
 * screen offers them. `ids` must list every value of the list exactly once.
 * One audit entry per value that moved.
 */
export class ReorderPricingItemsUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: PricingList; ids: string[] }): Promise<PricingItem[]> {
    input.access.ensure(MANAGE_PRICING);
    const items = await this.store.list(input.tenantId, input.list);
    const byId = new Map<string, PricingItem>(items.map((item) => [item.id, item]));
    if (input.ids.length !== items.length || new Set(input.ids).size !== items.length || !input.ids.every((id) => byId.has(id))) {
      throw new InvalidPricingOrderError();
    }

    const reordered = input.ids.map((id, index) => ({ ...byId.get(id)!, order: index + 1 }) as PricingItem);
    const moved = reordered.filter((item) => item.order !== byId.get(item.id)!.order);
    if (moved.length === 0) {
      return rulesFor(input.list).sort(items);
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      for (const item of moved) {
        await pricing.update(input.tenantId, input.list, item);
        await auditTrail.record(
          pricingAuditEntry(input.access, input.tenantId, listItemTarget(input.list, item), AuditAction.Update, [
            { field: 'order', old: byId.get(item.id)!.order, new: item.order },
          ])
        );
      }
    });
    return reordered;
  }
}
