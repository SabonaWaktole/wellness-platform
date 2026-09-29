import { ILookupStore } from '../../lookups/application/ports/ILookupStore';
import { LookupList } from '../../lookups/domain/LookupList';
import { BusinessType, Area, City } from '../../lookups/domain/LookupItem';
import { CompanyProfile, CompanyProfileInput } from '../domain/value-objects/CompanyProfile';

/**
 * Loads the three lookups a company profile points at and validates them
 * together as one unit (CompanyProfile.create) — shared by
 * CreateClientUseCase and UpdateClientUseCase so the two stay in step.
 */
export async function loadCompanyProfile(
  lookupStore: ILookupStore,
  tenantId: string,
  input: CompanyProfileInput
): Promise<CompanyProfile> {
  const [businessType, area, city] = await Promise.all([
    lookupStore.findById(tenantId, LookupList.BusinessTypes, input.businessTypeId) as Promise<BusinessType | null>,
    lookupStore.findById(tenantId, LookupList.Areas, input.areaId) as Promise<Area | null>,
    lookupStore.findById(tenantId, LookupList.Cities, input.cityId) as Promise<City | null>,
  ]);

  return CompanyProfile.create(input, { businessType, area, city });
}
