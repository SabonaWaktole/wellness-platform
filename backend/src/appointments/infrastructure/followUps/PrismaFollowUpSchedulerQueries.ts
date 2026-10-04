import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { DueFollowUp, FollowUpDaySummary, IFollowUpSchedulerQueries } from '../../application/followUps/ports/IFollowUpSchedulerQueries';
import { FOLLOW_UP_KIND, OPEN_STATUSES } from './prismaFollowUpRows';

/** Rows a sweep considers in one pass, as in PrismaSchedulerQueries. */
const SWEEP_LIMIT = 500;

export class PrismaFollowUpSchedulerQueries implements IFollowUpSchedulerQueries {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async timeZone(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    return tenant?.timezone ?? 'UTC';
  }

  async dueWithoutNotice(tenantId: string, since: Date, now: Date): Promise<DueFollowUp[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        kind: FOLLOW_UP_KIND,
        status: { in: OPEN_STATUSES },
        dueNotifiedAt: null,
        scheduledAt: { gt: since, lte: now },
      },
      select: { id: true, tenantId: true, assignedUserId: true, scheduledAt: true, type: true, notes: true, client: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: SWEEP_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      assignedUserId: row.assignedUserId,
      scheduledAt: row.scheduledAt,
      type: row.type,
      notes: row.notes,
      clientName: row.client.name ?? '',
    }));
  }

  async claimDueNotice(tenantId: string, id: string, scheduledAt: Date, at: Date): Promise<boolean> {
    // Conditional on the due time read: a reschedule in between re-armed it for a new time.
    const { count } = await this.prisma.appointment.updateMany({
      where: { id, tenantId, dueNotifiedAt: null, scheduledAt, status: { in: OPEN_STATUSES } },
      data: { dueNotifiedAt: at },
    });
    return count === 1;
  }

  async claimSummaryDay(tenantId: string, dayKey: string): Promise<boolean> {
    const { count } = await this.prisma.notificationSettings.updateMany({
      where: { tenantId, OR: [{ followUpSummarySentOn: null }, { followUpSummarySentOn: { not: dayKey } }] },
      data: { followUpSummarySentOn: dayKey },
    });
    return count === 1;
  }

  async daySummaries(tenantId: string, dayStart: Date, dayEnd: Date): Promise<FollowUpDaySummary[]> {
    const open = { tenantId, kind: FOLLOW_UP_KIND, status: { in: OPEN_STATUSES } };
    const [today, overdue] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['assignedUserId'], where: { ...open, scheduledAt: { gte: dayStart, lt: dayEnd } }, _count: { _all: true } }),
      this.prisma.appointment.groupBy({ by: ['assignedUserId'], where: { ...open, scheduledAt: { lt: dayStart } }, _count: { _all: true } }),
    ]);
    const byUser = new Map<string, FollowUpDaySummary>();
    const entry = (userId: string) => byUser.get(userId) ?? byUser.set(userId, { assignedUserId: userId, today: 0, overdue: 0 }).get(userId)!;
    for (const group of today) entry(group.assignedUserId).today = group._count._all;
    for (const group of overdue) entry(group.assignedUserId).overdue = group._count._all;
    return [...byUser.values()];
  }
}
