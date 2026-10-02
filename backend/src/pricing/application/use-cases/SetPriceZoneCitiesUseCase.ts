import { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { InvalidPricingValueError } from '../../domain/errors';
import { PriceZone, PricingList } from '../../domain/PricingLists';
import { findPricingItem, listItemTarget, MANAGE_PRICING, pricingAuditEntry, zoneCityNames } from '../pricingAdmin';
import { IPricingStore } from '../ports/IPricingStore';
import { IPricingWriteTransaction } from '../ports/IPricingWriteTransaction';

/**
 * Replaces the predefined cities of a price zone (FR-PCF-05). Each must be an
 * active city of this workspace's M1 list; a city may also be in other zones
 * (FR-PRC-06). Audited on the zone as the list of city names before and after.
 */
export class SetPriceZoneCitiesUseCase {
  constructor(
    private readonly store: IPricingStore,
    private readonly writeTx: IPricingWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; zoneId: string; cityIds: string[] }): Promise<PriceZone> {
    input.access.ensure(MANAGE_PRICING);
    const zone = await findPricingItem(this.store, input.tenantId, PricingList.Zones, input.zoneId);

    const cityIds = [...new Set(input.cityIds)];
    const cities = await this.store.cities(input.tenantId, cityIds);
    const activeIds = new Set(cities.filter((city) => city.active).map((city) => city.id));
    // A city already in the zone may stay after it was deactivated; only
    // additions must be active cities.
    const current = new Set(zone.cityIds);
    if (cityIds.some((id) => !activeIds.has(id) && !(current.has(id) && cities.some((city) => city.id === id)))) {
      throw new InvalidPricingValueError('CITY_NOT_ACTIVE', 'cityIds', 'Choose active cities from the list.');
    }

    const before = await zoneCityNames(this.store, input.tenantId, zone.cityIds);
    const after = await zoneCityNames(this.store, input.tenantId, cityIds);
    const next: PriceZone = { ...zone, cityIds };
    if (before.join('\n') === after.join('\n')) {
      return next;
    }

    await this.writeTx.run(async ({ pricing, auditTrail }) => {
      await pricing.setZoneCities(input.tenantId, zone.id, cityIds);
      await auditTrail.record(
        pricingAuditEntry(input.access, input.tenantId, listItemTarget(PricingList.Zones, zone), AuditAction.Update, [
          { field: 'cities', old: before, new: after },
        ])
      );
    });
    return next;
  }
}
