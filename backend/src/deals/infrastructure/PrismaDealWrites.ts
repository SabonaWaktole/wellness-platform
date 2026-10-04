import { Prisma, PrismaClient } from '@prisma/client';
import { Deal, DealStageChange } from '../domain/Deal';
import { IDealWrites } from '../application/ports/IDealWriteTransaction';
import { dealColumns, toDeal } from './prismaDealRows';

export class PrismaDealWrites implements IDealWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async find(tenantId: string, id: string): Promise<Deal | null> {
    const row = await this.prisma.deal.findFirst({ where: { id, tenantId, deletedAt: null } });
    return row ? toDeal(row) : null;
  }

  async companyName(tenantId: string, clientId: string): Promise<string> {
    const row = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { name: true } });
    return row?.name ?? '';
  }

  async insert(deal: Deal): Promise<void> {
    const props = deal.toProps();
    await this.prisma.deal.create({
      data: {
        ...dealColumns(deal),
        id: props.id,
        tenantId: props.tenantId,
        clientId: props.clientId,
        createdByUserId: props.createdByUserId,
        createdAt: props.createdAt,
      },
    });
  }

  async update(deal: Deal): Promise<void> {
    await this.prisma.deal.updateMany({ where: { id: deal.id, tenantId: deal.tenantId }, data: dealColumns(deal) });
  }

  async recordChange(tenantId: string, change: DealStageChange): Promise<void> {
    await this.prisma.dealStageHistory.create({ data: { ...change, tenantId } });
  }

  async setOfferValue(tenantId: string, dealId: string, value: { netMonthlyPrice: string | null; annualValue: string | null }): Promise<void> {
    await this.prisma.deal.updateMany({
      where: { id: dealId, tenantId },
      data: { offerNetMonthlyPrice: value.netMonthlyPrice, offerAnnualValue: value.annualValue },
    });
  }

  async isActiveLostReason(tenantId: string, reasonId: string): Promise<boolean> {
    return (await this.prisma.lostReason.count({ where: { id: reasonId, tenantId, active: true } })) > 0;
  }

  async makeClient(tenantId: string, clientId: string): Promise<{ previous: string | null; companyName: string } | null> {
    const row = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!row) return null;
    const definition = await this.prisma.customFieldDefinition.findFirst({ where: { tenantId, role: 'STATUS' } });
    const values = (typeof row.customFieldValues === 'string' ? JSON.parse(row.customFieldValues) : row.customFieldValues ?? {}) as Record<string, unknown>;
    const previous = (definition ? (values[definition.fieldName] as string | undefined) : undefined) ?? row.status ?? null;
    if (definition) values[definition.fieldName] = 'CLIENT';
    await this.prisma.client.updateMany({
      where: { id: clientId, tenantId },
      data: { status: 'CLIENT', customFieldValues: values as Prisma.InputJsonObject },
    });
    return { previous, companyName: row.name ?? '' };
  }

  async cancelOpenFollowUps(tenantId: string, dealId: string, reason: string, now: Date): Promise<number> {
    const result = await this.prisma.appointment.updateMany({
      where: { tenantId, dealId, kind: 'FOLLOW_UP', status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      data: { status: 'CANCELLED', cancelReason: reason, updatedAt: now },
    });
    return result.count;
  }

  async hasSentOffer(tenantId: string, dealId: string): Promise<boolean> {
    return (await this.prisma.quotation.count({ where: { tenantId, dealId, sentAt: { not: null } } })) > 0;
  }
}
