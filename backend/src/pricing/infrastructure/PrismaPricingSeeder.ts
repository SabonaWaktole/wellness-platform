import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IPricingSeeder } from '../application/ports/IPricingSeeder';
import {
  DEFAULT_DISCOUNT_CAP_PERCENT,
  DEFAULT_EMPLOYEE_BANDS,
  DEFAULT_PRICE_ZONES,
  DEFAULT_PRICING_CURRENCY,
  DEFAULT_RISK_SURCHARGES,
  DEFAULT_VISIT_FREQUENCIES,
} from '../domain/DefaultPricing';
import { DEFAULT_OFFER_TEXTS, DEFAULT_SERVICE_PACKAGE, DEFAULT_SERVICES, OFFER_TEXT_FIELDS } from '../domain/DefaultOfferSettings';
import { richTextData } from './prismaPricingRows';

/**
 * Risk surcharges and zone cities are matched to the workspace's lookup
 * values by natural key (risk `level`; area and city name), exactly as the
 * migration does for existing workspaces. A value the lookup seed did not
 * create is skipped rather than invented.
 */
export class PrismaPricingSeeder implements IPricingSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(tenantId: string): Promise<void> {
    // The offer numbers take their column defaults (Q6, Q9); the company name
    // starts as the workspace name until the Administrator fills in the details.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } });
    await this.prisma.pricingSettings.create({
      data: {
        tenantId,
        currency: DEFAULT_PRICING_CURRENCY,
        discountCapPercent: DEFAULT_DISCOUNT_CAP_PERCENT,
        companyName: tenant.name,
        ...Object.fromEntries(OFFER_TEXT_FIELDS.map((field) => [field, richTextData(DEFAULT_OFFER_TEXTS[field])])),
      },
    });

    await this.prisma.employeeBand.createMany({
      data: DEFAULT_EMPLOYEE_BANDS.map((band) => ({ id: randomUUID(), tenantId, ...band })),
    });

    const riskLevels = await this.prisma.riskLevel.findMany({ where: { tenantId }, select: { id: true, level: true } });
    const riskLevelIds = new Map(riskLevels.map((riskLevel) => [riskLevel.level, riskLevel.id]));
    await this.prisma.riskSurcharge.createMany({
      data: DEFAULT_RISK_SURCHARGES.filter((surcharge) => riskLevelIds.has(surcharge.riskLevel)).map((surcharge) => ({
        id: randomUUID(),
        tenantId,
        riskLevelId: riskLevelIds.get(surcharge.riskLevel)!,
        percent: surcharge.percent,
      })),
    });

    await this.prisma.visitFrequency.createMany({
      data: DEFAULT_VISIT_FREQUENCIES.map((frequency, index) => ({
        id: randomUUID(),
        tenantId,
        ...frequency,
        order: index + 1,
      })),
    });

    const cities = await this.prisma.city.findMany({
      where: { tenantId },
      select: { id: true, nameSq: true, area: { select: { nameSq: true } } },
    });
    const cityIds = new Map(cities.map((city) => [`${city.area.nameSq}/${city.nameSq}`, city.id]));
    const zones = DEFAULT_PRICE_ZONES.map((zone, index) => ({ zone, id: randomUUID(), order: index + 1 }));
    await this.prisma.priceZone.createMany({
      data: zones.map(({ zone, id, order }) => ({
        id,
        tenantId,
        nameSq: zone.nameSq,
        nameEn: zone.nameEn,
        surchargePercent: zone.surchargePercent,
        order,
      })),
    });
    await this.prisma.priceZoneCity.createMany({
      data: zones.flatMap(({ zone, id }) =>
        zone.cities
          .map(({ area, city }) => cityIds.get(`${area}/${city}`))
          .filter((cityId): cityId is string => cityId !== undefined)
          .map((cityId) => ({ zoneId: id, cityId }))
      ),
    });

    // FR-PCF-06: placeholder services and the default package holding them all.
    const services = DEFAULT_SERVICES.map((service, index) => ({ id: randomUUID(), tenantId, ...service, order: index + 1 }));
    await this.prisma.service.createMany({ data: services });
    const packageId = randomUUID();
    await this.prisma.servicePackage.create({
      data: { id: packageId, tenantId, ...DEFAULT_SERVICE_PACKAGE, isDefault: true, order: 1 },
    });
    await this.prisma.packageService.createMany({
      data: services.map((service) => ({ packageId, serviceId: service.id, order: service.order })),
    });
  }
}
