import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ILookupInUsePolicy } from '../application/ports/ILookupInUsePolicy';
import { LookupList } from '../domain/LookupList';

/**
 * Counts every record pointing at a list value, active or not: even an
 * inactive business type still holds its risk level.
 */
export class PrismaLookupInUsePolicy implements ILookupInUsePolicy {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async usages(tenantId: string, list: LookupList, id: string): Promise<number> {
    switch (list) {
      case LookupList.RiskLevels:
        return this.prisma.businessType.count({ where: { tenantId, riskLevelId: id } });
      case LookupList.BusinessTypes:
        // Nothing points at a business type until companies do (Slice 11).
        return 0;
    }
  }
}
