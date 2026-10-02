import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { insensitiveContains } from '../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { RecordScope } from '../../access/domain/RecordScope';
import { ownerWhere } from '../../access/infrastructure/prismaRecordScope';
import { CLOSED_DEAL_STAGES, DealStage, isOpenStage, OPEN_DEAL_STAGES } from '../domain/DealStage';
import { DealDetail, DealSummary } from '../application/dealViews';
import { BoardCursor, DealCompany, DealListFilters, DealSort, IDealStore } from '../application/ports/IDealStore';
import { DEAL_SUMMARY_INCLUDE, displayName, toSummary } from './prismaDealRows';

/** The column each list sort reads. */
const SORT_COLUMNS: Record<DealSort['field'], keyof Prisma.DealOrderByWithRelationInput> = {
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
  expectedCloseDate: 'expectedCloseDate',
  title: 'title',
  value: 'offerNetMonthlyPrice',
};

/**
 * Deal reads. The scope is always part of the WHERE clause (FR-RBAC-13), on
 * the deal's own salesperson, which is never NULL.
 */
export class PrismaDealStore implements IDealStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async detail(tenantId: string, id: string, scope: RecordScope): Promise<DealDetail | null> {
    const row = await this.prisma.deal.findFirst({
      where: { id, ...this.live(tenantId, scope) },
      include: {
        ...DEAL_SUMMARY_INCLUDE,
        client: {
          select: {
            name: true,
            contactPersons: {
              where: { deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
              select: { id: true, name: true, position: true, phone: true, email: true, isPrimary: true },
            },
          },
        },
        stageHistory: {
          where: { tenantId },
          orderBy: [{ at: 'asc' }, { id: 'asc' }],
          include: { changedBy: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      ...toSummary(row),
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      contacts: row.client.contactPersons,
      history: row.stageHistory.map((change) => ({
        id: change.id,
        fromStage: change.fromStage as DealStage | null,
        toStage: change.toStage as DealStage,
        changedByUserId: change.changedByUserId,
        changedByName: change.changedBy ? displayName(change.changedBy) : null,
        at: change.at.toISOString(),
      })),
    };
  }

  async search(
    tenantId: string,
    scope: RecordScope,
    filters: DealListFilters,
    sort: DealSort,
    page: { skip: number; take: number }
  ): Promise<{ items: DealSummary[]; total: number }> {
    const where: Prisma.DealWhereInput = { ...this.live(tenantId, scope) };
    const and = where.AND as Prisma.DealWhereInput[];
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.ownerUserId) where.ownerUserId = filters.ownerUserId;
    if (filters.stages?.length) where.stageKey = { in: filters.stages };
    if (filters.types?.length) where.type = { in: filters.types };
    if (filters.businessTypeId || filters.areaId || filters.cityId) {
      where.client = {
        ...(filters.businessTypeId ? { businessTypeId: filters.businessTypeId } : {}),
        ...(filters.areaId ? { areaId: filters.areaId } : {}),
        ...(filters.cityId ? { cityId: filters.cityId } : {}),
      };
    }
    if (filters.expectedCloseFrom || filters.expectedCloseTo) {
      where.expectedCloseDate = {
        ...(filters.expectedCloseFrom ? { gte: filters.expectedCloseFrom } : {}),
        ...(filters.expectedCloseTo ? { lte: filters.expectedCloseTo } : {}),
      };
    }
    if (filters.valueMin || filters.valueMax) {
      where.offerNetMonthlyPrice = {
        ...(filters.valueMin ? { gte: filters.valueMin } : {}),
        ...(filters.valueMax ? { lte: filters.valueMax } : {}),
      };
    }
    if (filters.query) {
      and.push({ OR: [{ title: insensitiveContains(filters.query) }, { client: { name: insensitiveContains(filters.query) } }] });
    }

    const [rows, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: DEAL_SUMMARY_INCLUDE,
        orderBy: [{ [SORT_COLUMNS[sort.field]]: sort.direction }, { id: sort.direction }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { items: rows.map(toSummary), total };
  }

  async boardCounts(
    tenantId: string,
    scope: RecordScope,
    closedSince: Date
  ): Promise<Map<DealStage, { count: number; totalNetMonthlyPrice: string | null }>> {
    const where: Prisma.DealWhereInput = this.live(tenantId, scope);
    (where.AND as Prisma.DealWhereInput[]).push({
      OR: [{ stageKey: { in: [...OPEN_DEAL_STAGES] } }, { stageKey: { in: [...CLOSED_DEAL_STAGES] }, closedAt: { gte: closedSince } }],
    });
    const groups = await this.prisma.deal.groupBy({
      by: ['stageKey'],
      where,
      _count: { _all: true },
      _sum: { offerNetMonthlyPrice: true },
    });
    return new Map(
      groups.map((group) => [
        group.stageKey as DealStage,
        { count: group._count._all, totalNetMonthlyPrice: group._sum.offerNetMonthlyPrice?.toFixed(2) ?? null },
      ])
    );
  }

  async boardColumn(
    tenantId: string,
    scope: RecordScope,
    stage: DealStage,
    closedSince: Date,
    cursor: BoardCursor | null,
    take: number
  ): Promise<DealSummary[]> {
    const where: Prisma.DealWhereInput = { ...this.live(tenantId, scope), stageKey: stage };
    if (!isOpenStage(stage)) where.closedAt = { gte: closedSince };
    if (cursor) {
      (where.AND as Prisma.DealWhereInput[]).push({
        OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }],
      });
    }
    const rows = await this.prisma.deal.findMany({
      where,
      include: DEAL_SUMMARY_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map(toSummary);
  }

  async company(tenantId: string, clientId: string): Promise<DealCompany | null> {
    const row = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
      select: { id: true, name: true, assignedUserId: true, assignedUser: { select: { isActive: true, deletedAt: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name ?? '',
      assignedUserId: row.assignedUserId,
      assigneeActive: !!row.assignedUser && row.assignedUser.isActive && !row.assignedUser.deletedAt,
    };
  }

  async isActiveUser(tenantId: string, userId: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { id: userId, tenantId, isActive: true, deletedAt: null } });
    return count > 0;
  }

  /** Live deals of the workspace inside `scope`. Its own AND array, so callers can add an OR beside the scope's. */
  private live(tenantId: string, scope: RecordScope): Prisma.DealWhereInput {
    return { tenantId, deletedAt: null, AND: [ownerWhere(scope, 'ownerUserId', { nullable: false })] };
  }
}
