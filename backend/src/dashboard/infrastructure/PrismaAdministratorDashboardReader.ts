import { Prisma, PrismaClient } from '@prisma/client';
import { ChangeRecord } from '../domain/ExecutiveDefinitions';
import {
  IAdministratorDashboardReader,
  PricingConfigurationSummary,
  RoleUsage,
} from '../application/wellness/ports/IAdministratorDashboardReader';

/** Entries read per type: enough to find the last change of one field among many of the same type. */
const RECENT_PER_TYPE = 50;

const fieldsOf = (changes: unknown): string[] =>
  Array.isArray(changes) ? changes.flatMap((change) => (change && typeof change.field === 'string' ? [change.field] : [])) : [];

/** Reads the workspace's configuration, users and audit trail for the Administrator dashboard. */
export class PrismaAdministratorDashboardReader implements IAdministratorDashboardReader {
  constructor(private readonly prisma: PrismaClient) {}

  async pricing(tenantId: string): Promise<PricingConfigurationSummary> {
    const [settings, bands, surcharges, frequencies, zones] = await Promise.all([
      this.prisma.pricingSettings.findUnique({ where: { tenantId }, select: { discountCapPercent: true } }),
      this.prisma.employeeBand.count({ where: { tenantId, active: true } }),
      this.prisma.riskSurcharge.count({ where: { tenantId } }),
      this.prisma.visitFrequency.count({ where: { tenantId, active: true } }),
      this.prisma.priceZone.count({ where: { tenantId, active: true } }),
    ]);
    return {
      // The schema default until a row is saved.
      discountCapPercent: new Prisma.Decimal(settings?.discountCapPercent ?? 10).toFixed(2),
      activeEmployeeBands: bands,
      riskSurcharges: surcharges,
      activeVisitFrequencies: frequencies,
      activePriceZones: zones,
    };
  }

  async changeRecords(tenantId: string, entityTypes: readonly string[]): Promise<Map<string, ChangeRecord[]>> {
    const lists = await Promise.all(
      entityTypes.map((entityType) =>
        this.prisma.auditEntry.findMany({
          where: { tenantId, entityType },
          orderBy: [{ at: 'desc' }, { id: 'desc' }],
          take: RECENT_PER_TYPE,
          select: { at: true, changes: true },
        })
      )
    );
    return new Map(entityTypes.map((type, index) => [type, lists[index].map((row) => ({ at: row.at, fields: fieldsOf(row.changes) }))]));
  }

  async roleUsage(tenantId: string): Promise<RoleUsage[]> {
    const [roles, grouped] = await Promise.all([
      this.prisma.role.findMany({ where: { tenantId }, select: { id: true, key: true, nameSq: true, nameEn: true }, orderBy: { nameEn: 'asc' } }),
      this.prisma.user.groupBy({ by: ['roleId', 'isActive'], where: { tenantId, deletedAt: null, roleId: { not: null } }, _count: { _all: true } }),
    ]);
    return roles.map((role) => {
      const of = (isActive: boolean) => grouped.find((row) => row.roleId === role.id && row.isActive === isActive)?._count._all ?? 0;
      return { roleId: role.id, key: role.key, nameSq: role.nameSq, nameEn: role.nameEn, activeUsers: of(true), inactiveUsers: of(false) };
    });
  }

  async citiesInNoZone(tenantId: string) {
    const cities = await this.prisma.city.findMany({
      where: { tenantId, active: true, priceZones: { none: { zone: { active: true } } } },
      select: { id: true, nameSq: true },
      orderBy: [{ nameSq: 'asc' }, { id: 'asc' }],
    });
    return cities.map((city) => ({ id: city.id, name: city.nameSq }));
  }
}
