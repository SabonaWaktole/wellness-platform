import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { PricingList } from '../../domain/PricingLists';
import {
  ensureListRulesKept,
  findPricingItem,
  listItemTarget,
  MANAGE_PRICING,
  packageServiceNames,
  pricingAuditEntry,
  rulesFor,
  wholeItemChanges,
  zoneCityNames,
} from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Deletes a value of a pricing list (a zone takes its city links with it, a
 * package its service links). A service in a package is in use and can only
 * be deactivated; the default package stays until another is the default
 * (FR-PCF-06). From Slice 8 a frequency, zone or package an offer used is in
 * use too.
 */
export class DeletePricingItemUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; list: PricingList; id: string }): Promise<void> {
    input.access.ensure(MANAGE_PRICING);
    const item = await findPricingItem(this.store, input.tenantId, input.list, input.id);
    await ensureListRulesKept(this.store, input.tenantId, input.list, item, 'delete');
    const changes = wholeItemChanges(rulesFor(input.list).audited(item), 'deleted');
    if (input.list === PricingList.Zones && 'cityIds' in item && item.cityIds.length > 0) {
      changes.push({ field: 'cities', old: await zoneCityNames(this.store, input.tenantId, item.cityIds), new: null });
    }
    if (input.list === PricingList.Packages && 'serviceIds' in item && item.serviceIds.length > 0) {
      const services = await this.store.list(input.tenantId, PricingList.Services);
      changes.push({ field: 'services', old: packageServiceNames(services, item.serviceIds), new: null });
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.delete(input.tenantId, input.list, item.id);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(input.list, item), AuditAction.Delete, changes)
      );
    });
  }
}
