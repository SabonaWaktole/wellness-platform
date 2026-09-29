import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/** Appointments are activities (visits and meetings), under `activities.view`. */
export class PrismaAppointmentTimelineSource implements TimelineSource {
  readonly category = 'ACTIVITY' as const;
  readonly permission = 'activities.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const rows = await this.prisma.appointment.findMany({ where: { tenantId, clientId } });
    return rows.map((row) => ({
      id: `appointment:${row.id}`,
      category: this.category,
      type: `APPOINTMENT_${row.status}`,
      // updatedAt, so a status change moves the appointment up the timeline.
      timestamp: row.updatedAt.toISOString(),
      actorId: row.assignedUserId,
      details: { scheduledAt: row.scheduledAt.toISOString(), notes: row.notes, status: row.status },
    }));
  }
}
