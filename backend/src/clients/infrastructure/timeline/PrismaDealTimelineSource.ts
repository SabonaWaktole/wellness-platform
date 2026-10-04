import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

/**
 * A company's deals (FR-DEAL-20): each deal's creation and every later stage
 * change, under `deals.view`, so Reception never sees them (FR-RBAC-17).
 * A deleted deal leaves the timeline with the deal. Won and lost
 * (Slice 13) are entries of their own, with the closing date; the agreed
 * values are named as the guarded fields, so they are removed without
 * `commercial.view` (FR-RBAC-17). The first history row is the creation itself, so it is
 * not repeated as a stage change.
 */
export class PrismaDealTimelineSource implements TimelineSource {
  readonly category = 'DEAL' as const;
  readonly permission = 'deals.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const deals = await this.prisma.deal.findMany({
      where: { tenantId, clientId, deletedAt: null },
      include: { lostReason: { select: { nameSq: true, nameEn: true } }, stageHistory: { where: { tenantId, fromStage: { not: null } } } },
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
      // The stage change into Won or Lost is shown as its own event, not twice.
      // A deal that was reopened keeps its old Won and Lost rows as stage changes.
      const stageChanges = changes.filter((entry) => entry.details.toStage !== deal.stageKey || !['WON', 'LOST'].includes(deal.stageKey));
      const closer = (stage: string) => [...deal.stageHistory].reverse().find((row) => row.toStage === stage)?.changedByUserId ?? deal.ownerUserId;
      const closed: TimelineEntry[] = [];
      if (deal.stageKey === 'WON' && deal.wonAt) {
        closed.push({
          id: `deal-won:${deal.id}`,
          category: this.category,
          type: 'DEAL_WON',
          timestamp: deal.wonAt.toISOString(),
          actorId: closer('WON'),
          details: {
            ...about,
            agreedMonthlyPrice: deal.agreedMonthlyPrice?.toFixed(2) ?? null,
            agreedAnnualValue: deal.agreedAnnualValue?.toFixed(2) ?? null,
          },
        });
      }
      if (deal.stageKey === 'LOST' && deal.lostAt) {
        closed.push({
          id: `deal-lost:${deal.id}`,
          category: this.category,
          type: 'DEAL_LOST',
          timestamp: deal.lostAt.toISOString(),
          actorId: closer('LOST'),
          details: {
            ...about,
            lostReasonSq: deal.lostReason?.nameSq ?? null,
            lostReasonEn: deal.lostReason?.nameEn ?? null,
            lostNote: deal.lostNote,
          },
        });
      }
      return [created, ...stageChanges, ...closed];
    });
  }
}
