import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingItem, PricingList } from '../../domain/PricingLists';
import { listItemTarget, MANAGE_PRICING, pricingAuditEntry, rulesFor, wholeItemChanges } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Adds a band (FR-PCF-01), a visit frequency (FR-PCF-04) or a price zone
 * (FR-PCF-05). It is active at once, so the next calculation uses it; a new
 * zone starts with no cities.
 */
export class CreatePricingItemUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    list: PricingList;
    values: Record<string, unknown>;
  }): Promise<PricingItem> {
    input.access.ensure(MANAGE_PRICING);
    const rules = rulesFor(input.list);
    const siblings = await this.store.list(input.tenantId, input.list);

    const order = siblings.reduce((max, item) => Math.max(max, item.order), 0) + 1;
    const item = { ...rules.build(input.values, null), id: randomUUID(), order, active: true } as PricingItem;
    rules.validate(item, siblings);

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.create(input.tenantId, input.list, item);
      await auditTrail.record(
        pricingAuditEntry(
          input.access,
          input.tenantId,
          listItemTarget(input.list, item),
          AuditAction.Create,
          wholeItemChanges(rules.audited(item), 'created')
        )
      );
    });
    return item;
  }
}
