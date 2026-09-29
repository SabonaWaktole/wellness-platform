import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/**
 * Contacts added and removed. Reads soft-deleted rows on purpose: removing a
 * contact is itself an event. Only the name and position are shown — never
 * the phone or email of a removed contact (NFR-SEC-03). ContactPerson records
 * no author, so the actor is null.
 */
export class PrismaContactTimelineSource implements TimelineSource {
  readonly category = 'CONTACT' as const;
  readonly permission = 'companies.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const rows = await this.prisma.contactPerson.findMany({ where: { tenantId, clientId } });
    return rows.flatMap((row) => {
      const details = { name: row.name, position: row.position };
      const added: TimelineEntry = {
        id: `contact-added:${row.id}`,
        category: this.category,
        type: 'CONTACT_ADDED',
        timestamp: row.createdAt.toISOString(),
        actorId: null,
        details,
      };
      if (!row.deletedAt) return [added];
      return [
        added,
        {
          id: `contact-removed:${row.id}`,
          category: this.category,
          type: 'CONTACT_REMOVED',
          timestamp: row.deletedAt.toISOString(),
          actorId: null,
          details,
        },
      ];
    });
  }
}
