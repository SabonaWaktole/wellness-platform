import { PrismaClient, Prisma } from '@prisma/client';
import { IInteractionRepository, RecentInteractionsOptions } from '../../domain/repositories/IInteractionRepository';
import { ALL_RECORDS } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { Interaction } from '../../domain/entities/Interaction';
import { InteractionChannel } from '../../domain/enums/InteractionChannel';
import { OutcomeCategory } from '../../domain/entities/OutcomeCategory';

type InteractionRow = Prisma.InteractionGetPayload<{ include: { outcomeCategory: true } }>;

function toInteraction(r: InteractionRow): Interaction {
  return Interaction.create({
    id: r.id,
    tenantId: r.tenantId,
    clientId: r.clientId,
    authorUserId: r.authorUserId,
    content: r.content,
    channel: r.channel as InteractionChannel,
    outcomeCategory: r.outcomeCategory ? OutcomeCategory.create({
      id: r.outcomeCategory.id,
      tenantId: r.outcomeCategory.tenantId,
      label: r.outcomeCategory.label,
    }) : undefined,
    createdAt: r.createdAt,
    occurredAt: r.occurredAt,
    contactPersonId: r.contactPersonId,
    dealId: r.dealId,
    resultId: r.resultId,
    clientFeedback: r.clientFeedback,
    nextAction: r.nextAction,
    updatedAt: r.updatedAt,
    updatedByUserId: r.updatedByUserId,
  });
}

/** The columns an activity's details live in (FR-ACT-02): written on create and on every edit. */
function detailColumns(interaction: Interaction) {
  return {
    content: interaction.content,
    channel: interaction.channel,
    occurredAt: interaction.occurredAt,
    contactPersonId: interaction.contactPersonId,
    dealId: interaction.dealId,
    resultId: interaction.resultId,
    clientFeedback: interaction.clientFeedback,
    nextAction: interaction.nextAction,
  };
}

export class PrismaInteractionRepository implements IInteractionRepository {
  constructor(private prisma: PrismaClient) {}

  async findByClientId(tenantId: string, clientId: string): Promise<Interaction[]> {
    const records = await this.prisma.interaction.findMany({
      where: { tenantId, clientId },
      include: { outcomeCategory: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toInteraction);
  }

  async findById(id: string): Promise<Interaction | null> {
    const record = await this.prisma.interaction.findUnique({
      where: { id },
      include: { outcomeCategory: true },
    });
    return record ? toInteraction(record) : null;
  }

  async findRecentByTenant(tenantId: string, limit: number, options: RecentInteractionsOptions = {}): Promise<Interaction[]> {
    const where: Prisma.InteractionWhereInput = {
      tenantId,
      client: ownerWhere(options.scope ?? ALL_RECORDS, 'assignedUserId'),
    };
    if (options.channels) {
      where.channel = { in: options.channels };
    }

    const records = await this.prisma.interaction.findMany({
      where,
      include: { outcomeCategory: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map(toInteraction);
  }

  async save(tenantId: string, interaction: Interaction): Promise<void> {
    await this.prisma.interaction.create({
      data: {
        id: interaction.id,
        tenantId: interaction.tenantId,
        clientId: interaction.clientId,
        authorUserId: interaction.authorUserId,
        outcomeCategoryId: interaction.outcomeCategory?.id || null,
        createdAt: interaction.createdAt,
        ...detailColumns(interaction),
      },
    });
  }

  async update(interaction: Interaction): Promise<void> {
    await this.prisma.interaction.updateMany({
      where: { id: interaction.id, tenantId: interaction.tenantId },
      data: {
        ...detailColumns(interaction),
        updatedAt: interaction.updatedAt,
        updatedByUserId: interaction.updatedByUserId,
      },
    });
  }
}
