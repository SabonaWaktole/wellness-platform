import { ILookupStore } from '../../lookups/application/ports/ILookupStore';
import { LookupList } from '../../lookups/domain/LookupList';
import { BusinessType, RiskLevel, Area, City } from '../../lookups/domain/LookupItem';
import { Client } from '../domain/entities/Client';
import { riskFor } from '../domain/services/CompanyRisk';

export interface EnrichedLookupView {
  id: string;
  nameSq: string;
  nameEn: string | null;
}

export interface EnrichedRiskView extends EnrichedLookupView {
  level: number;
}

export interface CompanyProfileView {
  businessTypeId: string | null;
  employeeCount: number | null;
  areaId: string | null;
  cityId: string | null;
  streetAddress: string | null;
  taxId: string | null;
  website: string | null;
  businessType: EnrichedLookupView | null;
  riskLevel: EnrichedRiskView | null;
  area: EnrichedLookupView | null;
  city: EnrichedLookupView | null;
}

/**
 * Attaches the Slice 11 lookup labels (business type, risk level, area,
 * city) to a client read. Risk is always derived here, from the business
 * type — it is never stored, so recolouring or reclassifying a business
 * type on Settings changes what every company reads back without a
 * migration (SRS §7.1).
 */
export class CompanyReadModel {
  constructor(private readonly lookupStore: ILookupStore) {}

  async enrichOne(tenantId: string, client: Client): Promise<CompanyProfileView> {
    return (await this.enrichMany(tenantId, [client]))[0];
  }

  async enrichMany(tenantId: string, clients: Client[]): Promise<CompanyProfileView[]> {
    const [businessTypes, riskLevels, areas, cities] = await Promise.all([
      this.lookupStore.list(tenantId, LookupList.BusinessTypes) as Promise<BusinessType[]>,
      this.lookupStore.list(tenantId, LookupList.RiskLevels) as Promise<RiskLevel[]>,
      this.lookupStore.list(tenantId, LookupList.Areas) as Promise<Area[]>,
      this.lookupStore.list(tenantId, LookupList.Cities) as Promise<City[]>,
    ]);

    const view = (label: { id: string; nameSq: string; nameEn: string | null } | undefined): EnrichedLookupView | null =>
      label ? { id: label.id, nameSq: label.nameSq, nameEn: label.nameEn } : null;

    return clients.map((client) => {
      const profile = client.profile;
      const businessType = businessTypes.find((bt) => bt.id === profile?.businessTypeId);
      const risk = riskFor(profile?.businessTypeId, businessTypes, riskLevels);
      const area = areas.find((a) => a.id === profile?.areaId);
      const city = cities.find((c) => c.id === profile?.cityId);

      return {
        businessTypeId: profile?.businessTypeId ?? null,
        employeeCount: profile?.employeeCount ?? null,
        areaId: profile?.areaId ?? null,
        cityId: profile?.cityId ?? null,
        streetAddress: profile?.streetAddress ?? null,
        taxId: profile?.taxId ?? null,
        website: profile?.website ?? null,
        businessType: view(businessType),
        riskLevel: risk ? { id: risk.id, nameSq: risk.nameSq, nameEn: risk.nameEn, level: risk.level } : null,
        area: view(area),
        city: view(city),
      };
    });
  }
}
