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
        // A company whose business type this is (Slice 11), active or not:
        // an archived company still carries a historical classification.
        return this.prisma.client.count({ where: { tenantId, businessTypeId: id } });
      case LookupList.Areas: {
        // Active or not: even an inactive city still holds its area, and an
        // archived company still holds its area (Slice 11).
        const [cities, clients] = await Promise.all([
          this.prisma.city.count({ where: { tenantId, areaId: id } }),
          this.prisma.client.count({ where: { tenantId, areaId: id } }),
        ]);
        return cities + clients;
      }
      case LookupList.Cities: {
        // A company in this city (Slice 11), active or not, or a price zone
        // that lists it (M2 Slice 3, FR-PCF-05).
        const [clients, zones] = await Promise.all([
          this.prisma.client.count({ where: { tenantId, cityId: id } }),
          this.prisma.priceZoneCity.count({ where: { cityId: id, zone: { tenantId } } }),
        ]);
        return clients + zones;
      }
      case LookupList.LostReasons:
        // A lost deal keeps its reason (M2 Slice 6; set by Slice 13), deleted deals included.
        return this.prisma.deal.count({ where: { tenantId, lostReasonId: id } });
      case LookupList.FollowUpIntervals:
        // Nothing points at this list until follow-ups do (M2 Slice 11).
        return 0;
    }
  }
}
