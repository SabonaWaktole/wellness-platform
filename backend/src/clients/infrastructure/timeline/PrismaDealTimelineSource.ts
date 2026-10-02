import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/**
 * A company's deals (FR-DEAL-20): each deal's creation and every later stage
 * change, under `deals.view`, so Reception never sees them (FR-RBAC-17).
 * A deleted deal leaves the timeline with the deal. Won and lost entries
 * join in Slice 13. The first history row is the creation itself, so it is
 * not repeated as a stage change.
 */
export class PrismaDealTimelineSource implements TimelineSource {
  readonly category = 'DEAL' as const;
  readonly permission = 'deals.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const deals = await this.prisma.deal.findMany({
      where: { tenantId, clientId, deletedAt: null },
      include: { stageHistory: { where: { tenantId, fromStage: { not: null } } } },
    });

    return deals.flatMap((deal) => {
      const about = { dealId: deal.id, title: deal.title, type: deal.type };
      const created: TimelineEntry = {
        id: `deal:${deal.id}`,
        category: this.category,
        type: 'DEAL_CREATED',
        timestamp: deal.createdAt.toISOString(),
        actorId: deal.createdByUserId,
        details: { ...about, ownerUserId: deal.ownerUserId },
      };
      const changes: TimelineEntry[] = deal.stageHistory.map((change) => ({
        id: `deal-stage:${change.id}`,
        category: this.category,
        type: 'DEAL_STAGE_CHANGED',
        timestamp: change.at.toISOString(),
        // NULL: the platform moved the deal (FR-DEAL-08).
        actorId: change.changedByUserId,
        details: { ...about, fromStage: change.fromStage, toStage: change.toStage },
      }));
      return [created, ...changes];
    });
  }
}
