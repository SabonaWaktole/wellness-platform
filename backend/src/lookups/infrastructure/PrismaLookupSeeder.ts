import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ILookupSeeder } from '../application/ports/ILookupSeeder';
import { DEFAULT_BUSINESS_TYPES, DEFAULT_RISK_LEVELS } from '../domain/DefaultLookups';

export class PrismaLookupSeeder implements ILookupSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(tenantId: string): Promise<void> {
    const riskLevelIds = new Map(DEFAULT_RISK_LEVELS.map((riskLevel) => [riskLevel.level, randomUUID()]));
    await this.prisma.riskLevel.createMany({
      data: DEFAULT_RISK_LEVELS.map((riskLevel, index) => ({
        id: riskLevelIds.get(riskLevel.level)!,
        tenantId,
        ...riskLevel,
        order: index + 1,
      })),
    });
    await this.prisma.businessType.createMany({
      data: DEFAULT_BUSINESS_TYPES.map(({ riskLevel, ...names }, index) => ({
        id: randomUUID(),
        tenantId,
        ...names,
        riskLevelId: riskLevelIds.get(riskLevel)!,
        order: index + 1,
      })),
    });
  }
}
