import { Prisma } from '@prisma/client';
import { ActivityView } from '../application/activityViews';

/** What an activity view reads besides the interaction itself. */
export const activityInclude = {
  authorUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  contactPerson: { select: { id: true, name: true } },
  result: { select: { id: true, nameSq: true, nameEn: true } },
} satisfies Prisma.InteractionInclude;

export type ActivityRow = Prisma.InteractionGetPayload<{ include: typeof activityInclude }>;

/** A row the Slice 7 migration has not dated yet reads as its creation (FR-ACT-07). */
export const occurredAtOf = (row: { occurredAt: Date | null; createdAt: Date }): Date => row.occurredAt ?? row.createdAt;

export function toActivityView(row: ActivityRow): ActivityView {
  const author = row.authorUser;
  return {
    id: row.id,
    clientId: row.clientId,
    dealId: row.dealId,
    channel: row.channel,
    content: row.content,
    occurredAt: occurredAtOf(row).toISOString(),
    recordedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    author: { id: author.id, name: [author.firstName, author.lastName].filter(Boolean).join(' ') || author.email },
    contact: row.contactPerson ? { id: row.contactPerson.id, name: row.contactPerson.name } : null,
    result: row.result ? { id: row.result.id, nameSq: row.result.nameSq, nameEn: row.result.nameEn } : null,
    clientFeedback: row.clientFeedback,
    nextAction: row.nextAction,
  };
}
