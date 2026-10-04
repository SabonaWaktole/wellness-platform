import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { FollowUpView } from '../../application/followUps/followUpViews';
import { FollowUpListFilters, FollowUpSourceActivity, IFollowUpStore } from '../../application/followUps/ports/IFollowUpStore';
import { FOLLOW_UP_KIND, FOLLOW_UP_VIEW_INCLUDE, OPEN_STATUSES, toFollowUpView } from './prismaFollowUpRows';

/**
 * Follow-up reads, on the `(tenantId, assignedUserId, status, scheduledAt)`
 * index. The scope is always part of the WHERE clause, on the salesperson,
 * which is never NULL.
 */
export class PrismaFollowUpStore implements IFollowUpStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async view(tenantId: string, id: string): Promise<Omit<FollowUpView, 'isOverdue'> | null> {
    const row = await this.prisma.appointment.findFirst({ where: { id, tenantId, kind: FOLLOW_UP_KIND }, include: FOLLOW_UP_VIEW_INCLUDE });
    return row ? toFollowUpView(row) : null;
  }

  async listOpen(tenantId: string, scope: RecordScope, filters: FollowUpListFilters, limit: number): Promise<Omit<FollowUpView, 'isOverdue'>[]> {
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      kind: FOLLOW_UP_KIND,
      status: { in: OPEN_STATUSES },
      AND: [ownerWhere(scope, 'assignedUserId', { nullable: false })],
    };
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters.dealId) where.dealId = filters.dealId;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.dueBefore) where.scheduledAt = { lt: filters.dueBefore };
    const rows = await this.prisma.appointment.findMany({
      where,
      include: FOLLOW_UP_VIEW_INCLUDE,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toFollowUpView);
  }

  countOverdue(tenantId: string, assignedUserId: string, now: Date): Promise<number> {
    return this.prisma.appointment.count({
      where: { tenantId, assignedUserId, kind: FOLLOW_UP_KIND, status: { in: OPEN_STATUSES }, scheduledAt: { lt: now } },
    });
  }

  async activity(tenantId: string, id: string): Promise<FollowUpSourceActivity | null> {
    const row = await this.prisma.interaction.findFirst({
      where: { id, tenantId },
      select: { id: true, clientId: true, dealId: true, contactPersonId: true, nextAction: true },
    });
    return row;
  }

  async isContactOf(tenantId: string, clientId: string, contactPersonId: string): Promise<boolean> {
    const count = await this.prisma.contactPerson.count({ where: { id: contactPersonId, tenantId, clientId, deletedAt: null } });
    return count > 0;
  }
}
