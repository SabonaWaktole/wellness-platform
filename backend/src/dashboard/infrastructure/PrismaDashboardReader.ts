import { PrismaClient } from '@prisma/client';
import { Money } from '../../pricing/domain/Money';
import { PaymentStatus } from '../../contracts/domain/ContractPayment';
import { validityWhere } from '../../contracts/infrastructure/repositories/contractValidityWhere';
import { OPEN_DEAL_STAGES } from '../../deals/domain/DealStage';
import { LostDeal, OpenDeal } from '../domain/DashboardDefinitions';
import {
  DashboardOwnerQuery,
  FollowUpCounts,
  IDashboardReader,
  Location,
  LostReasonName,
} from '../application/wellness/ports/IDashboardReader';
import { IndicatorQuery } from '../application/wellness/ports/IPerformanceReader';
import { PrismaPerformanceReader } from './PrismaPerformanceReader';

const OPEN_FOLLOW_UP = ['SCHEDULED', 'CONFIRMED'];

/** The dashboards' location filter (FR-DSH-04): the company's predefined Area and City. */
const clientIn = (location?: Location) =>
  location && (location.areaId || location.cityId)
    ? { client: { ...(location.areaId ? { areaId: location.areaId } : {}), ...(location.cityId ? { cityId: location.cityId } : {}) } }
    : {};

/**
 * The reads behind the Sales User and Sales Manager dashboards. Every query filters on the
 * salespeople it is given in the database (FR-RBAC-23); money is read as `Money`, never a number.
 */
export class PrismaDashboardReader implements IDashboardReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly performance: PrismaPerformanceReader
  ) {}

  async openDeals(query: DashboardOwnerQuery): Promise<OpenDeal[]> {
    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId: query.tenantId,
        deletedAt: null,
        ownerUserId: { in: [...query.salespersonIds] },
        stageKey: { in: [...OPEN_DEAL_STAGES] },
        ...clientIn(query.location),
      },
      select: { ownerUserId: true, stageKey: true, offerAnnualValue: true },
    });
    return deals.map((deal) => ({
      ownerId: deal.ownerUserId,
      stageKey: deal.stageKey,
      annualValue: deal.offerAnnualValue ? Money.of(deal.offerAnnualValue.toFixed(2)) : null,
    }));
  }

  async lostDeals(query: IndicatorQuery): Promise<Array<LostDeal & { ownerId: string }>> {
    return this.performance.lostDeals(query);
  }

  async followUps(query: DashboardOwnerQuery & { now: Date; endOfToday: Date; endOfNext7Days: Date }) {
    const base = {
      tenantId: query.tenantId,
      kind: 'FOLLOW_UP',
      status: { in: OPEN_FOLLOW_UP },
      assignedUserId: { in: [...query.salespersonIds] },
      ...clientIn(query.location),
    };
    const [overdue, today, next7] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['assignedUserId'], where: { ...base, scheduledAt: { lt: query.now } }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({
        by: ['assignedUserId'],
        where: { ...base, scheduledAt: { gte: query.now, lt: query.endOfToday } },
        _count: { _all: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['assignedUserId'],
        where: { ...base, scheduledAt: { gte: query.endOfToday, lt: query.endOfNext7Days } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map<string, FollowUpCounts>(query.salespersonIds.map((id) => [id, { dueToday: 0, dueNext7Days: 0, overdue: 0 }]));
    for (const row of overdue) counts.get(row.assignedUserId)!.overdue = row._count._all;
    for (const row of today) counts.get(row.assignedUserId)!.dueToday = row._count._all;
    for (const row of next7) counts.get(row.assignedUserId)!.dueNext7Days = row._count._all;
    return counts;
  }

  /** The salesperson responsible is the contract's, else the company's (as the Renewals screen reads it). */
  private async perResponsible(
    ids: readonly string[],
    rows: Array<{ assignedUserId: string | null; client: { assignedUserId: string | null } }>
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>(ids.map((id) => [id, 0]));
    for (const row of rows) {
      const owner = row.assignedUserId ?? row.client.assignedUserId;
      if (owner && counts.has(owner)) counts.set(owner, counts.get(owner)! + 1);
    }
    return counts;
  }

  private responsibleWhere(ids: readonly string[]) {
    const list = [...ids];
    return { OR: [{ assignedUserId: { in: list } }, { assignedUserId: null, client: { assignedUserId: { in: list } } }] };
  }

  async contractsExpiringSoon(query: DashboardOwnerQuery & { today: Date; windowDays: number }) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId: query.tenantId,
        AND: [validityWhere('EXPIRING_SOON', query.today, query.windowDays) as object, this.responsibleWhere(query.salespersonIds)],
        ...clientIn(query.location),
      },
      select: { assignedUserId: true, client: { select: { assignedUserId: true } } },
    });
    return this.perResponsible(query.salespersonIds, contracts);
  }

  async overdueInstalments(query: DashboardOwnerQuery) {
    const payments = await this.prisma.contractPayment.findMany({
      where: {
        tenantId: query.tenantId,
        status: PaymentStatus.Overdue,
        contract: { AND: [this.responsibleWhere(query.salespersonIds), clientIn(query.location)] },
      },
      select: { contract: { select: { assignedUserId: true, client: { select: { assignedUserId: true } } } } },
    });
    return this.perResponsible(query.salespersonIds, payments.map((payment) => payment.contract));
  }

  async pendingDiscountApprovals(query: DashboardOwnerQuery): Promise<number> {
    return this.prisma.discountApproval.count({
      where: { tenantId: query.tenantId, status: 'PENDING', requestedByUserId: { in: [...query.salespersonIds] } },
    });
  }

  async lostReasons(tenantId: string): Promise<LostReasonName[]> {
    return this.prisma.lostReason.findMany({ where: { tenantId }, select: { id: true, nameSq: true, nameEn: true } });
  }

  async locationIsPredefined(tenantId: string, location: Location): Promise<boolean> {
    const [area, city] = await Promise.all([
      location.areaId ? this.prisma.area.findFirst({ where: { id: location.areaId, tenantId }, select: { id: true } }) : null,
      location.cityId
        ? this.prisma.city.findFirst({ where: { id: location.cityId, tenantId, ...(location.areaId ? { areaId: location.areaId } : {}) }, select: { id: true } })
        : null,
    ]);
    return (!location.areaId || area !== null) && (!location.cityId || city !== null);
  }

  async roleLineage(tenantId: string, userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true, assignedRole: { select: { key: true, baseKey: true } } },
    });
    if (!user) return null;
    if (user.assignedRole) return user.assignedRole.baseKey ?? user.assignedRole.key;
    // A user not yet given a role reads it from the legacy string (D2).
    return user.role === 'BUSINESS_OWNER' ? 'ADMINISTRATOR' : 'SALES_USER';
  }
}

