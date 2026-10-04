import { PrismaClient } from '@prisma/client';
import { IFollowUpWrites } from '../../application/followUps/ports/IFollowUpWriteTransaction';
import { ScheduledActivity } from '../../domain/followUps/ScheduledActivity';
import { FOLLOW_UP_KIND, followUpColumns, toScheduledActivity } from './prismaFollowUpRows';

/** Follow-up writes on one connection, usually a transaction's. */
export class PrismaFollowUpWrites implements IFollowUpWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async find(tenantId: string, id: string): Promise<ScheduledActivity | null> {
    const row = await this.prisma.appointment.findFirst({ where: { id, tenantId, kind: FOLLOW_UP_KIND }, include: { auditLogs: true } });
    return row ? toScheduledActivity(row) : null;
  }

  async insert(followUp: ScheduledActivity): Promise<void> {
    const props = followUp.toProps();
    await this.prisma.appointment.create({
      data: { id: props.id, tenantId: props.tenantId, createdAt: props.createdAt, ...followUpColumns(followUp) },
    });
  }

  async update(followUp: ScheduledActivity): Promise<void> {
    const props = followUp.toProps();
    await this.prisma.appointment.update({ where: { id: props.id }, data: followUpColumns(followUp) });
    // The history is append-only: only the reschedules not stored yet are written.
    const stored = await this.prisma.appointmentAuditLog.count({ where: { appointmentId: props.id } });
    const fresh = props.history.slice(stored);
    if (fresh.length > 0) {
      await this.prisma.appointmentAuditLog.createMany({
        data: fresh.map((entry) => ({
          appointmentId: props.id,
          previousDate: entry.previousDate,
          newDate: entry.newDate,
          reason: entry.reason,
          changedBy: entry.changedBy,
          createdAt: entry.createdAt,
        })),
      });
    }
  }
}
