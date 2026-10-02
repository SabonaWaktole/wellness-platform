import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingItem, PricingList } from '../../domain/PricingLists';
import { ensureListRulesKept, findPricingItem, listItemTarget, MANAGE_PRICING, pricingAuditEntry, rulesFor } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Deactivates or reactivates a value of a pricing list. An inactive value is
 * left out of every new calculation and offer but stays on the offers that
 * used it. Reactivating a band is refused if it would overlap an active one
 * (FR-PCF-01). The default package cannot be deactivated, and neither can the
 * last active service of an active package (FR-PCF-06).
 */
export class SetPricingItemActiveUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: PricingList;
    id: string;
    active: boolean;
  }): Promise<PricingItem> {
    input.access.ensure(MANAGE_PRICING);
    const current = await findPricingItem(this.store, input.tenantId, input.list, input.id);
    if (current.active === input.active) {
      return current;
    }

    const next = { ...current, active: input.active } as PricingItem;
    await ensureListRulesKept(this.store, input.tenantId, input.list, current, input.active ? 'reactivate' : 'deactivate');
    if (input.active) {
      rulesFor(input.list).validate(next, await this.store.list(input.tenantId, input.list));
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.update(input.tenantId, input.list, next);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(input.list, next), AuditAction.StatusChange, [
          { field: 'active', old: current.active, new: next.active },
        ])
      );
    });
    return next;
  }
}
