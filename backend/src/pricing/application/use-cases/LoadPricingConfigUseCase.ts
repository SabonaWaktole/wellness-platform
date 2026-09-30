import { Money } from '../../domain/Money';
import { Percent } from '../../domain/Percent';
import { FrequencyPricing, PricingConfig } from '../../domain/PricingConfig';
import { PricingList } from '../../domain/PricingLists';
import { IPricingStore } from '../ports/IPricingStore';

/** Until Slice 4 adds the offer settings, contracts run the SRS default of 12 months (FR-PCF-08). */
export const DEFAULT_CONTRACT_MONTHS = 12;

/**
 * The only way the calculator gets its configuration (SRS §4 developer
 * note): the workspace's active bands, frequencies and zones and every risk
 * surcharge, as the Slice 1 `PricingConfig`. It reads the current values, so a
 * change applies to the next calculation; offers keep the values they were
 * calculated with (FR-PCF-10, Slice 8). No permission check: it is a building
 * block for use cases that make their own.
 */
export class LoadPricingConfigUseCase {
  constructor(private readonly store: IPricingStore) {}

  async execute(tenantId: string): Promise<PricingConfig> {
    const [settings, bands, riskSurcharges, frequencies, zones] = await Promise.all([
      this.store.settings(tenantId),
      this.store.list(tenantId, PricingList.Bands),
      this.store.riskSurcharges(tenantId),
      this.store.list(tenantId, PricingList.Frequencies),
      this.store.list(tenantId, PricingList.Zones),
    ]);

    return {
      bands: bands
        .filter((band) => band.active)
        .map((band) => ({
          min: band.minEmployees,
          max: band.maxEmployees,
          baseFee: Money.of(band.baseFee),
          perEmployeeFee: Money.of(band.perEmployeeFee),
        })),
      riskSurcharges: Object.fromEntries(
        riskSurcharges
          .filter((row) => row.riskSurchargePercent !== null)
          .map((row) => [row.riskLevelId, Percent.of(row.riskSurchargePercent!)])
      ),
      frequencies: Object.fromEntries(
        frequencies
          .filter((frequency) => frequency.active)
          .map((frequency): [string, FrequencyPricing] => [
            frequency.id,
            frequency.pricingType === 'FIXED'
              ? { type: 'FIXED', amount: Money.of(frequency.frequencyValue) }
              : { type: 'PERCENT', value: Percent.of(frequency.frequencyValue) },
          ])
      ),
      zones: Object.fromEntries(zones.filter((zone) => zone.active).map((zone) => [zone.id, Percent.of(zone.surchargePercent)])),
      discountCap: Percent.of(settings.discountCapPercent),
      contractMonths: DEFAULT_CONTRACT_MONTHS,
    };
  }
}
