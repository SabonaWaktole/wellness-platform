import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingList } from '../../domain/PricingLists';
import {
  findPricingItem,
  listItemTarget,
  MANAGE_PRICING,
  pricingAuditEntry,
  rulesFor,
  wholeItemChanges,
  zoneCityNames,
} from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Deletes a band, frequency or zone (a zone takes its city links with it).
 * Nothing refers to these values yet; from Slice 8 a frequency or zone an
 * offer used is in use and can only be deactivated.
 */
export class DeletePricingItemUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: PricingList; id: string }): Promise<void> {
    input.access.ensure(MANAGE_PRICING);
    const item = await findPricingItem(this.store, input.tenantId, input.list, input.id);
    const changes = wholeItemChanges(rulesFor(input.list).audited(item), 'deleted');
    if (input.list === PricingList.Zones && 'cityIds' in item && item.cityIds.length > 0) {
      changes.push({ field: 'cities', old: await zoneCityNames(this.store, input.tenantId, item.cityIds), new: null });
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.delete(input.tenantId, input.list, item.id);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(input.list, item), AuditAction.Delete, changes)
      );
    });
  }
}
