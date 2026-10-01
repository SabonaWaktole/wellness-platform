import { AccessContext } from '../../../access/domain/AccessContext';
import { OfferSettings } from '../../domain/OfferSettings';
import { EmployeeBand, PriceZone, PricingList, Service, ServicePackage, VisitFrequency } from '../../domain/PricingLists';
import { MANAGE_PRICING, rulesFor } from '../pricingAdmin';
import { IPricingStore, RiskSurchargeRecord } from '../ports/IPricingStore';

export interface PricingConfiguration {
  currency: string;
  discountCapPercent: string;
  bands: EmployeeBand[];
  /** Every M1 risk level, with `riskSurchargePercent: null` where none is set. */
  riskSurcharges: Omit<RiskSurchargeRecord, 'surchargeId'>[];
  frequencies: VisitFrequency[];
  zones: PriceZone[];
  services: Service[];
  packages: ServicePackage[];
  offerSettings: OfferSettings;
}

/**
 * Settings → Pricing (FR-PCF-01..08): every value of the pricing model, the
 * services and packages, inactive ones included, and the offer settings, as
 * the Administrator edits them.
 */
export class GetPricingConfigurationUseCase {
  constructor(private readonly store: IPricingStore) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<PricingConfiguration> {
    input.access.ensure(MANAGE_PRICING);
    const [settings, bands, riskSurcharges, frequencies, zones, services, packages] = await Promise.all([
      this.store.settings(input.tenantId),
      this.store.list(input.tenantId, PricingList.Bands),
      this.store.riskSurcharges(input.tenantId),
      this.store.list(input.tenantId, PricingList.Frequencies),
      this.store.list(input.tenantId, PricingList.Zones),
      this.store.list(input.tenantId, PricingList.Services),
      this.store.list(input.tenantId, PricingList.Packages),
    ]);
    return {
      ...settings,
      bands: rulesFor(PricingList.Bands).sort(bands) as EmployeeBand[],
      riskSurcharges: riskSurcharges.map(({ surchargeId: _surchargeId, ...riskSurcharge }) => riskSurcharge),
      frequencies: rulesFor(PricingList.Frequencies).sort(frequencies) as VisitFrequency[],
      zones: rulesFor(PricingList.Zones).sort(zones) as PriceZone[],
      services: rulesFor(PricingList.Services).sort(services) as Service[],
      packages: rulesFor(PricingList.Packages).sort(packages) as ServicePackage[],
    };
  }
}
