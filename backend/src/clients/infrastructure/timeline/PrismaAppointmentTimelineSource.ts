import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/** A follow-up's status as its timeline event. Open statuses read as scheduled. */
const FOLLOW_UP_EVENT: Record<string, string> = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * Appointments are activities (visits and meetings), under `activities.view`.
 * A follow-up (M2 Slice 11) shows as FOLLOW_UP_SCHEDULED, _COMPLETED or
 * _CANCELLED, with its type of contact, deal and cancel reason.
 */
export class PrismaAppointmentTimelineSource implements TimelineSource {
  readonly category = 'ACTIVITY' as const;
  readonly permission = 'activities.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const rows = await this.prisma.appointment.findMany({ where: { tenantId, clientId } });
    return rows.map((row) => {
      if (row.kind === 'FOLLOW_UP') {
        return {
          id: `appointment:${row.id}`,
          category: this.category,
          type: `FOLLOW_UP_${FOLLOW_UP_EVENT[row.status] ?? 'SCHEDULED'}`,
          timestamp: row.updatedAt.toISOString(),
          actorId: row.assignedUserId,
          details: {
            scheduledAt: row.scheduledAt.toISOString(),
            notes: row.notes,
            status: row.status,
            followUpType: row.type,
            dealId: row.dealId,
            cancelReason: row.cancelReason,
            completedInteractionId: row.completedInteractionId,
          },
        };
      }
      return {
        id: `appointment:${row.id}`,
        category: this.category,
        type: `APPOINTMENT_${row.status}`,
        // updatedAt, so a status change moves the appointment up the timeline.
        timestamp: row.updatedAt.toISOString(),
        actorId: row.assignedUserId,
        details: { scheduledAt: row.scheduledAt.toISOString(), notes: row.notes, status: row.status },
      };
    });
  }
}
