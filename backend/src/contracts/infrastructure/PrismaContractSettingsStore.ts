import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IContractSettingsStore } from '../application/ports/IContractSettingsStore';
import { ContractSettings } from '../domain/ContractSettings';

export class PrismaContractSettingsStore implements IContractSettingsStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async get(tenantId: string): Promise<ContractSettings> {
    const row = await this.prisma.contractSettings.findUnique({ where: { tenantId } });
    if (!row) return ContractSettings.defaults(tenantId);
    return ContractSettings.rebuild({ ...row, reminderLeadDays: row.reminderLeadDays as number[] });
  }

  async save(settings: ContractSettings, updatedByUserId: string | null): Promise<void> {
    const data = { ...settings.toJSON(), updatedByUserId };
    await this.prisma.contractSettings.upsert({
      where: { tenantId: settings.tenantId },
      create: { tenantId: settings.tenantId, ...data },
      update: data,
    });
  }
}
