import { AccessContext } from '../../../access/domain/AccessContext';
import { MANAGE_PRICING } from '../pricingAdmin';
import { CityRecord, IPricingStore } from '../ports/IPricingStore';

/**
 * The warning on the price zones screen (FR-PCF-05): active cities that no
 * active zone lists. A company in one of them gets "Price on request".
 */
export class ListCitiesWithoutZoneUseCase {
  constructor(private readonly store: IPricingStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<CityRecord[]> {
    input.access.ensure(MANAGE_PRICING);
    return this.store.citiesWithoutZone(input.tenantId);
  }
}
