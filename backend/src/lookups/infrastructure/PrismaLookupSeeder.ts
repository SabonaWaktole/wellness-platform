import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ILookupSeeder } from '../application/ports/ILookupSeeder';
import {
  DEFAULT_ACTIVITY_RESULTS,
  DEFAULT_AREAS,
  DEFAULT_BUSINESS_TYPES,
  DEFAULT_FOLLOW_UP_INTERVALS,
  DEFAULT_LOST_REASONS,
  DEFAULT_RISK_LEVELS,
} from '../domain/DefaultLookups';

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

    const areaIds = new Map(DEFAULT_AREAS.map((area) => [area.nameSq, randomUUID()]));
    await this.prisma.area.createMany({
      data: DEFAULT_AREAS.map((area, index) => ({
        id: areaIds.get(area.nameSq)!,
        tenantId,
        nameSq: area.nameSq,
        nameEn: area.nameEn,
        order: index + 1,
      })),
    });
    await this.prisma.city.createMany({
      data: DEFAULT_AREAS.flatMap((area) =>
        area.cities.map((city, index) => ({
          id: randomUUID(),
          tenantId,
          areaId: areaIds.get(area.nameSq)!,
          nameSq: city.nameSq,
          nameEn: city.nameEn,
          order: index + 1,
        }))
      ),
    });

    await this.prisma.followUpInterval.createMany({
      data: DEFAULT_FOLLOW_UP_INTERVALS.map((interval, index) => ({
        id: randomUUID(),
        tenantId,
        ...interval,
        order: index + 1,
      })),
    });
    await this.prisma.lostReason.createMany({
      data: DEFAULT_LOST_REASONS.map((reason, index) => ({
        id: randomUUID(),
        tenantId,
        ...reason,
        order: index + 1,
      })),
    });
    await this.prisma.activityResult.createMany({
      data: DEFAULT_ACTIVITY_RESULTS.map((result, index) => ({
        id: randomUUID(),
        tenantId,
        ...result,
        order: index + 1,
      })),
    });
  }
}
