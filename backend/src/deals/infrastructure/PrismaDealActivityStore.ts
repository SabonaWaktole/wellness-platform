import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ActivityView } from '../../clients/application/activityViews';
import { activityInclude, toActivityView } from '../../clients/infrastructure/activityRows';
import { IDealActivityStore } from '../application/ports/IDealActivityStore';

export class PrismaDealActivityStore implements IDealActivityStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async forDeal(tenantId: string, dealId: string, channels: string[]): Promise<ActivityView[]> {
    if (channels.length === 0) return [];
    const rows = await this.prisma.interaction.findMany({
      where: { tenantId, dealId, channel: { in: channels } },
      include: activityInclude,
      // Every activity linked to a deal was recorded after Slice 7, so
      // occurredAt is always set; the id breaks ties.
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toActivityView);
  }
}
