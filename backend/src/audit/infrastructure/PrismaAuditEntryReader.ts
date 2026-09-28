import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { AuditEntryPage, AuditEntryView, IAuditEntryReader } from '../application/ports/IAuditEntryReader';
import { AuditFilter, AuditQuery } from '../domain/AuditQuery';
import { AuditAction } from '../domain/AuditAction';
import { AuditChange } from '../domain/AuditChange';

type RawEntry = {
  id: string;
  tenantId: string;
  at: Date;
  userId: string | null;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  changes: Prisma.JsonValue;
};

function whereFor(tenantId: string, filter: AuditFilter): Prisma.AuditEntryWhereInput {
  const where: Prisma.AuditEntryWhereInput = { tenantId };
  if (filter.from || filter.to) {
    where.at = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  }
  if (filter.userId === 'SYSTEM') {
    where.userId = null;
  } else if (filter.userId) {
    where.userId = filter.userId;
  }
  if (filter.entityType) {
    where.entityType = filter.entityType;
  }
  if (filter.action) {
    where.action = filter.action;
  }
  return where;
}

/**
 * Reads `AuditEntry` rows for the viewer and CSV export (FR-AUD-06, 08).
 * Nothing here writes — `PrismaAuditTrail` stays the only place an entry is
 * created, and no method here can update or delete one (FR-AUD-05).
 */
export class PrismaAuditEntryReader implements IAuditEntryReader {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async search(tenantId: string, query: AuditQuery): Promise<AuditEntryPage> {
    const where = whereFor(tenantId, query);
    const skip = (query.page - 1) * query.limit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditEntry.count({ where }),
      this.prisma.auditEntry.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'desc' }], skip, take: query.limit }),
    ]);

    return { data: await this.withActors(tenantId, rows as RawEntry[]), total };
  }

  async findById(tenantId: string, id: string): Promise<AuditEntryView | null> {
    const row = await this.prisma.auditEntry.findFirst({ where: { id, tenantId } });
    if (!row) {
      return null;
    }
    const [view] = await this.withActors(tenantId, [row as RawEntry]);
    return view;
  }

  async *stream(tenantId: string, filter: AuditFilter, batchSize = 500): AsyncIterable<AuditEntryView[]> {
    const where = whereFor(tenantId, filter);
    let cursor: { at: Date; id: string } | undefined;

    for (;;) {
      const rows = (await this.prisma.auditEntry.findMany({
        where: cursor ? { ...where, OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] } : where,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        take: batchSize,
      })) as RawEntry[];

      if (rows.length === 0) {
        return;
      }
      yield await this.withActors(tenantId, rows);
      const last = rows[rows.length - 1]!;
      cursor = { at: last.at, id: last.id };
      if (rows.length < batchSize) {
        return;
      }
    }
  }

  /** Resolves each row's actor name and role labels in one batched query each. */
  private async withActors(tenantId: string, rows: RawEntry[]): Promise<AuditEntryView[]> {
    const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => !!id))];
    const roleKeys = [...new Set(rows.map((row) => row.userRole))];

    const [users, roles] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
        : Promise.resolve([]),
      this.prisma.role.findMany({ where: { tenantId, key: { in: roleKeys } }, select: { key: true, nameSq: true, nameEn: true } }),
    ]);

    const userById = new Map(users.map((user) => [user.id, user]));
    const roleByKey = new Map(roles.map((role) => [role.key, role]));

    return rows.map((row) => {
      const user = row.userId ? userById.get(row.userId) : undefined;
      const role = roleByKey.get(row.userRole);
      return {
        id: row.id,
        tenantId: row.tenantId,
        at: row.at,
        userId: row.userId,
        userRole: row.userRole,
        action: row.action as AuditAction,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: row.entityLabel,
        changes: row.changes as unknown as AuditChange[],
        userName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : null,
        roleNameSq: role?.nameSq ?? null,
        roleNameEn: role?.nameEn ?? null,
      };
    });
  }
}
