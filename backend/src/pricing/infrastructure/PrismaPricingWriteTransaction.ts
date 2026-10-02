import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import { IPricingWrites, IPricingWriteTransaction, PricingWriteRepos } from '../application/ports/IPricingWriteTransaction';
import { OfferSettings } from '../domain/OfferSettings';
import { EmployeeBand, PriceZone, PricingItemOf, PricingList, Service, ServicePackage, VisitFrequency } from '../domain/PricingLists';
import { bandData, frequencyData, offerSettingsData, packageData, serviceData, zoneData } from './prismaPricingRows';

class PrismaPricingWrites implements IPricingWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async create<L extends PricingList>(tenantId: string, list: L, item: PricingItemOf[L]): Promise<void> {
    switch (list) {
      case PricingList.Bands:
        await this.prisma.employeeBand.create({ data: { id: item.id, tenantId, ...bandData(item as EmployeeBand) } });
        return;
      case PricingList.Frequencies:
        await this.prisma.visitFrequency.create({ data: { id: item.id, tenantId, ...frequencyData(item as VisitFrequency) } });
        return;
      case PricingList.Zones:
        await this.prisma.priceZone.create({ data: { id: item.id, tenantId, ...zoneData(item as PriceZone) } });
        return;
      case PricingList.Services:
        await this.prisma.service.create({ data: { id: item.id, tenantId, ...serviceData(item as Service) } });
        return;
      case PricingList.Packages: {
        const pkg = item as ServicePackage;
        await this.prisma.servicePackage.create({ data: { id: pkg.id, tenantId, ...packageData(pkg), isDefault: pkg.isDefault } });
        await this.setPackageServices(tenantId, pkg.id, pkg.serviceIds);
        return;
      }
    }
  }

  async update<L extends PricingList>(tenantId: string, list: L, item: PricingItemOf[L]): Promise<void> {
    const where = { id: item.id, tenantId };
    switch (list) {
      case PricingList.Bands:
        await this.prisma.employeeBand.updateMany({ where, data: bandData(item as EmployeeBand) });
        return;
      case PricingList.Frequencies:
        await this.prisma.visitFrequency.updateMany({ where, data: frequencyData(item as VisitFrequency) });
        return;
      case PricingList.Zones:
        await this.prisma.priceZone.updateMany({ where, data: zoneData(item as PriceZone) });
        return;
      case PricingList.Services:
        await this.prisma.service.updateMany({ where, data: serviceData(item as Service) });
        return;
      case PricingList.Packages:
        await this.prisma.servicePackage.updateMany({ where, data: packageData(item as ServicePackage) });
        return;
    }
  }

  async delete(tenantId: string, list: PricingList, id: string): Promise<void> {
    const where = { id, tenantId };
    switch (list) {
      case PricingList.Bands:
        await this.prisma.employeeBand.deleteMany({ where });
        return;
      case PricingList.Frequencies:
        await this.prisma.visitFrequency.deleteMany({ where });
        return;
      case PricingList.Zones:
        // The zone's city links cascade with it.
        await this.prisma.priceZone.deleteMany({ where });
        return;
      case PricingList.Services:
        await this.prisma.service.deleteMany({ where });
        return;
      case PricingList.Packages:
        // The package's service links cascade with it.
        await this.prisma.servicePackage.deleteMany({ where });
        return;
    }
  }

  async setZoneCities(tenantId: string, zoneId: string, cityIds: string[]): Promise<void> {
    // Scoped through the zone's tenant, so no write can reach another workspace's zone.
    await this.prisma.priceZoneCity.deleteMany({ where: { zoneId, zone: { tenantId } } });
    if (cityIds.length > 0) {
      await this.prisma.priceZoneCity.createMany({ data: cityIds.map((cityId) => ({ zoneId, cityId })) });
    }
  }

  async upsertRiskSurcharge(tenantId: string, surcharge: { id: string; riskLevelId: string; percent: string }): Promise<void> {
    await this.prisma.riskSurcharge.upsert({
      where: { tenantId_riskLevelId: { tenantId, riskLevelId: surcharge.riskLevelId } },
      create: { id: surcharge.id, tenantId, riskLevelId: surcharge.riskLevelId, percent: surcharge.percent },
      update: { percent: surcharge.percent },
    });
  }

  async setDiscountCap(tenantId: string, discountCapPercent: string): Promise<void> {
    await this.prisma.pricingSettings.upsert({
      where: { tenantId },
      create: { tenantId, discountCapPercent },
      update: { discountCapPercent },
    });
  }

  async setPackageServices(tenantId: string, packageId: string, serviceIds: string[]): Promise<void> {
    // Scoped through the package's tenant, so no write can reach another workspace's package.
    await this.prisma.packageService.deleteMany({ where: { packageId, package: { tenantId } } });
    if (serviceIds.length > 0) {
      await this.prisma.packageService.createMany({
        data: serviceIds.map((serviceId, index) => ({ packageId, serviceId, order: index + 1 })),
      });
    }
  }

  async setDefaultPackage(tenantId: string, packageId: string): Promise<void> {
    await this.prisma.servicePackage.updateMany({ where: { tenantId, isDefault: true, id: { not: packageId } }, data: { isDefault: false } });
    await this.prisma.servicePackage.updateMany({ where: { tenantId, id: packageId }, data: { isDefault: true } });
  }

  async updateOfferSettings(tenantId: string, changes: Partial<OfferSettings>): Promise<void> {
    // Every workspace has its row from the seed or the migration; the upsert
    // only guards a database restored from before them.
    const data = offerSettingsData(changes);
    await this.prisma.pricingSettings.upsert({
      where: { tenantId },
      create: { ...(data as Prisma.PricingSettingsUncheckedCreateInput), tenantId },
      update: data,
    });
  }
}

export class PrismaPricingWriteTransaction implements IPricingWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // pricing change back (FR-AUD-09), as in PrismaLookupWriteTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: PricingWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ pricing: new PrismaPricingWrites(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
