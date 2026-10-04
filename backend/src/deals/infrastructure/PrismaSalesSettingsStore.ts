import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ISalesSettingsStore } from '../application/ports/ISalesSettingsStore';
import { SalesSettings } from '../domain/SalesSettings';

export class PrismaSalesSettingsStore implements ISalesSettingsStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async get(tenantId: string): Promise<SalesSettings> {
    const row = await this.prisma.salesSettings.findUnique({ where: { tenantId } });
    return row ? SalesSettings.rebuild(row) : SalesSettings.defaults(tenantId);
  }

  async save(settings: SalesSettings): Promise<void> {
    const data = { staleDealDays: settings.staleDealDays };
    await this.prisma.salesSettings.upsert({ where: { tenantId: settings.tenantId }, create: { tenantId: settings.tenantId, ...data }, update: data });
  }
}
