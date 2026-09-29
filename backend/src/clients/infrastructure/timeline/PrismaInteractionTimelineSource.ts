import { PrismaClient } from '@prisma/client';
import { InteractionChannel } from '../../domain/enums/InteractionChannel';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/**
 * Notes, or every other channel (calls, emails, meetings). Two instances of
 * one class because D3 puts them behind different permissions.
 */
export class PrismaInteractionTimelineSource implements TimelineSource {
  readonly permission: string;

  constructor(
    private prisma: PrismaClient,
    readonly category: 'NOTE' | 'ACTIVITY'
  ) {
    this.permission = category === 'NOTE' ? 'notes.view' : 'activities.view';
  }

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const rows = await this.prisma.interaction.findMany({
      where: {
        tenantId,
        clientId,
        channel: this.category === 'NOTE' ? InteractionChannel.NOTE : { not: InteractionChannel.NOTE },
      },
    });
    return rows.map((row) => ({
      id: `interaction:${row.id}`,
      category: this.category,
      type: 'INTERACTION_ADDED',
      timestamp: row.createdAt.toISOString(),
      actorId: row.authorUserId,
      details: { channel: row.channel, content: row.content, outcomeCategoryId: row.outcomeCategoryId },
    }));
  }
}
