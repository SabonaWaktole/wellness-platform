import { PrismaClient } from '@prisma/client';
import { InteractionChannel } from '../../domain/enums/InteractionChannel';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';
import { activityInclude, occurredAtOf, toActivityView } from '../activityRows';

/**
 * Notes, or every other channel (calls, emails, visits, meetings, online
 * meetings). Two instances of one class because D3 puts them behind
 * different permissions. An activity sits on the timeline at the time it
 * happened, not the time it was typed in (FR-ACT-05), and carries its
 * contact, result and next action.
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
      include: activityInclude,
    });
    return rows.map((row) => {
      const { author, ...activity } = toActivityView(row);
      return {
        id: `interaction:${row.id}`,
        category: this.category,
        type: 'INTERACTION_ADDED',
        timestamp: occurredAtOf(row).toISOString(),
        actorId: author.id,
        details: { ...activity, outcomeCategoryId: row.outcomeCategoryId },
      };
    });
  }
}
