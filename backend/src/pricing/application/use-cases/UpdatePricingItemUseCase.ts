import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { PricingItem, PricingList } from '../../domain/PricingLists';
import { findPricingItem, listItemTarget, MANAGE_PRICING, pricingAuditEntry, rulesFor } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Edits a band, frequency or zone. Omitted fields keep their value. The next
 * calculation uses the new values; offers already created keep theirs
 * (FR-PCF-10, from Slice 8). Order, active and a zone's cities have their own
 * use cases.
 */
export class UpdatePricingItemUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: PricingList;
    id: string;
    values: Record<string, unknown>;
  }): Promise<PricingItem> {
    input.access.ensure(MANAGE_PRICING);
    const rules = rulesFor(input.list);
    const current = await findPricingItem(this.store, input.tenantId, input.list, input.id);

    const next = { ...current, ...rules.build(input.values, current) } as PricingItem;
    rules.validate(next, await this.store.list(input.tenantId, input.list));

    const audited = rules.audited(next);
    const changes = diff(rules.audited(current), audited, Object.keys(audited));
    if (changes.length === 0) {
      return current;
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.update(input.tenantId, input.list, next);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(input.list, next), AuditAction.Update, changes)
      );
    });
    return next;
  }
}
