import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';
import { quotationReference } from '../../../quotations/domain/quotationReference';

/**
 * Offers: each quotation's creation and every status change, legacy
 * quotations and deal offers alike. `total` is redacted for viewers without
 * `commercial.view`.
 */
export class PrismaQuotationTimelineSource implements TimelineSource {
  readonly category = 'QUOTATION' as const;
  readonly permission = 'quotations.manage';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const quotations = await this.prisma.quotation.findMany({
      where: { tenantId, clientId },
      include: {
        lineItems: { select: { quantity: true, unitPrice: true } },
        statusHistory: { where: { tenantId } },
      },
    });

    return quotations.flatMap((quotation) => {
      const reference = quotationReference(quotation.id);
      const created: TimelineEntry = {
        id: `quotation:${quotation.id}`,
        category: this.category,
        type: 'QUOTATION_CREATED',
        timestamp: quotation.createdAt.toISOString(),
        actorId: quotation.createdByUserId,
        details: {
          quotationId: quotation.id,
          reference,
          status: quotation.status,
          // An offer (M2 Slice 8) has no product lines: its total is its net
          // monthly price, absent on a "Price on request" draft. Slice 9
          // gives offers their own reference and permission here.
          total: quotation.dealId
            ? quotation.netMonthlyPrice?.toNumber()
            : quotation.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
        },
      };
      const changes: TimelineEntry[] = quotation.statusHistory.map((change) => ({
        id: `quotation-status:${change.id}`,
        category: this.category,
        type: 'QUOTATION_STATUS_CHANGED',
        timestamp: change.createdAt.toISOString(),
        actorId: change.changedByUserId,
        details: {
          quotationId: quotation.id,
          reference,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          note: change.note,
        },
      }));
      return [created, ...changes];
    });
  }
}
