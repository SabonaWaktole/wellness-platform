import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { DEFAULT_DISCOUNT_CAP_PERCENT, DEFAULT_PRICING_CURRENCY } from '../domain/DefaultPricing';
import { DEFAULT_CONTRACT_MONTHS, DEFAULT_OFFER_NUMBER_PREFIX, DEFAULT_OFFER_VALIDITY_DAYS } from '../domain/DefaultOfferSettings';
import { OfferSettings } from '../domain/OfferSettings';
import { PricingItemOf, PricingList } from '../domain/PricingLists';
import { CityRecord, IPricingStore, PricingSettingsRecord, RiskSurchargeRecord } from '../application/ports/IPricingStore';
import {
  bandFromRow,
  decimalText,
  frequencyFromRow,
  offerSettingsFromRow,
  packageFromRow,
  packageInclude,
  serviceFromRow,
  zoneFromRow,
  zoneInclude,
} from './prismaPricingRows';

/** What a workspace without a settings row reads (every workspace gets one from the seed or the migration). */
const DEFAULT_OFFER_SETTINGS: OfferSettings = {
  offerValidityDays: DEFAULT_OFFER_VALIDITY_DAYS,
  contractMonthsDefault: DEFAULT_CONTRACT_MONTHS,
  offerNumberPrefix: DEFAULT_OFFER_NUMBER_PREFIX,
  companyName: null,
  nipt: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  bankDetails: null,
  introSq: null,
  introEn: null,
  termsSq: null,
  termsEn: null,
  closingSq: null,
  closingEn: null,
};

const citySelect = {
  id: true,
  nameSq: true,
  nameEn: true,
  areaId: true,
  active: true,
  area: { select: { nameSq: true, nameEn: true, order: true } },
} as const;

type CityRow = {
  id: string;
  nameSq: string;
  nameEn: string | null;
  areaId: string;
  active: boolean;
  area: { nameSq: string; nameEn: string | null };
};

const cityFromRow = (row: CityRow): CityRecord => ({
  id: row.id,
  nameSq: row.nameSq,
  nameEn: row.nameEn,
  areaId: row.areaId,
  areaNameSq: row.area.nameSq,
  areaNameEn: row.area.nameEn,
  active: row.active,
});

export class PrismaPricingStore implements IPricingStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async settings(tenantId: string): Promise<PricingSettingsRecord> {
    const row = await this.prisma.pricingSettings.findUnique({ where: { tenantId } });
    // Every workspace gets a row from the seed or the migration; a missing one
    // reads as the defaults rather than failing the pricing screen.
    return row
      ? { currency: row.currency, discountCapPercent: decimalText(row.discountCapPercent), offerSettings: offerSettingsFromRow(row) }
      : { currency: DEFAULT_PRICING_CURRENCY, discountCapPercent: DEFAULT_DISCOUNT_CAP_PERCENT, offerSettings: DEFAULT_OFFER_SETTINGS };
  }

  async list<L extends PricingList>(tenantId: string, list: L): Promise<PricingItemOf[L][]> {
    return (await this.rows(tenantId, list)) as PricingItemOf[L][];
  }

  async findById<L extends PricingList>(tenantId: string, list: L, id: string): Promise<PricingItemOf[L] | null> {
    const [item] = await this.rows(tenantId, list, id);
    return (item ?? null) as PricingItemOf[L] | null;
  }

  private async rows(tenantId: string, list: PricingList, id?: string) {
    const where = id === undefined ? { tenantId } : { tenantId, id };
    switch (list) {
      case PricingList.Bands:
        return (await this.prisma.employeeBand.findMany({ where })).map(bandFromRow);
      case PricingList.Frequencies:
        return (await this.prisma.visitFrequency.findMany({ where })).map(frequencyFromRow);
      case PricingList.Zones:
        return (await this.prisma.priceZone.findMany({ where, include: zoneInclude })).map(zoneFromRow);
      case PricingList.Services:
        return (await this.prisma.service.findMany({ where })).map(serviceFromRow);
      case PricingList.Packages:
        return (await this.prisma.servicePackage.findMany({ where, include: packageInclude })).map(packageFromRow);
    }
  }

  async riskSurcharges(tenantId: string): Promise<RiskSurchargeRecord[]> {
    const levels = await this.prisma.riskLevel.findMany({
      where: { tenantId },
      include: { riskSurcharges: { where: { tenantId } } },
      orderBy: [{ order: 'asc' }, { level: 'asc' }],
    });
    return levels.map((level) => {
      const surcharge = level.riskSurcharges[0];
      return {
        riskLevelId: level.id,
        level: level.level,
        nameSq: level.nameSq,
        nameEn: level.nameEn,
        active: level.active,
        surchargeId: surcharge?.id ?? null,
        riskSurchargePercent: surcharge ? decimalText(surcharge.percent) : null,
      };
    });
  }

  async cities(tenantId: string, ids: string[]): Promise<CityRecord[]> {
    if (ids.length === 0) return [];
    return (await this.prisma.city.findMany({ where: { tenantId, id: { in: ids } }, select: citySelect })).map(cityFromRow);
  }

  async citiesWithoutZone(tenantId: string): Promise<CityRecord[]> {
    const rows = await this.prisma.city.findMany({
      where: { tenantId, active: true, priceZones: { none: { zone: { active: true } } } },
      select: citySelect,
      orderBy: [{ area: { order: 'asc' } }, { order: 'asc' }, { nameSq: 'asc' }],
    });
    return rows.map(cityFromRow);
  }
}
