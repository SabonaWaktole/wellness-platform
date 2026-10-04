import { Prisma } from '@prisma/client';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { ScheduledActivity, ScheduledActivityKind, ScheduledActivityType } from '../../domain/followUps/ScheduledActivity';
import { FollowUpView } from '../../application/followUps/followUpViews';

/** Only follow-ups: the planned meetings of Slice 12 share the table (plan D1). */
export const FOLLOW_UP_KIND = ScheduledActivityKind.FollowUp;

export const OPEN_STATUSES = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];

const personName = { select: { firstName: true, lastName: true, email: true } } as const;

/** What a view needs from an Appointment row. */
export const FOLLOW_UP_VIEW_INCLUDE = {
  client: { select: { name: true } },
  deal: { select: { title: true, type: true } },
  contactPerson: { select: { name: true } },
  assignedUser: personName,
  auditLogs: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.AppointmentInclude;

type ViewRow = Prisma.AppointmentGetPayload<{ include: typeof FOLLOW_UP_VIEW_INCLUDE }>;
type EntityRow = Prisma.AppointmentGetPayload<{ include: { auditLogs: true } }>;

function displayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function toFollowUpView(row: ViewRow): Omit<FollowUpView, 'isOverdue'> {
  return {
    id: row.id,
    clientId: row.clientId,
    companyName: row.client.name ?? '',
    dealId: row.dealId,
    dealTitle: row.deal?.title ?? null,
    dealType: row.deal?.type ?? null,
    contactPersonId: row.contactPersonId,
    contactName: row.contactPerson?.name ?? null,
    assignedUserId: row.assignedUserId,
    assignedUserName: displayName(row.assignedUser),
    type: row.type as ScheduledActivityType,
    status: row.status as AppointmentStatus,
    scheduledAt: row.scheduledAt.toISOString(),
    notes: row.notes,
    intervalDays: row.intervalDays,
    completedInteractionId: row.completedInteractionId,
    cancelReason: row.cancelReason,
    history: row.auditLogs.map((log) => ({
      previousDate: log.previousDate.toISOString(),
      newDate: log.newDate.toISOString(),
      reason: log.reason,
      changedByUserId: log.changedBy,
      at: log.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toScheduledActivity(row: EntityRow): ScheduledActivity {
  return ScheduledActivity.rebuild({
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    assignedUserId: row.assignedUserId,
    kind: row.kind as ScheduledActivityKind,
    type: row.type as ScheduledActivityType,
    status: row.status as AppointmentStatus,
    scheduledAt: row.scheduledAt,
    endAt: row.endAt,
    place: row.place,
    dealId: row.dealId,
    contactPersonId: row.contactPersonId,
    notes: row.notes,
    intervalDays: row.intervalDays,
    completedInteractionId: row.completedInteractionId,
    cancelReason: row.cancelReason,
    dueNotifiedAt: row.dueNotifiedAt,
    history: [...row.auditLogs]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((log) => ({ previousDate: log.previousDate, newDate: log.newDate, reason: log.reason, changedBy: log.changedBy, createdAt: log.createdAt })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** The columns a scheduled activity writes. */
export function followUpColumns(followUp: ScheduledActivity) {
  const props = followUp.toProps();
  return {
    clientId: props.clientId,
    assignedUserId: props.assignedUserId,
    kind: props.kind,
    type: props.type,
    status: props.status,
    scheduledAt: props.scheduledAt,
    endAt: props.endAt,
    place: props.place,
    dealId: props.dealId,
    contactPersonId: props.contactPersonId,
    notes: props.notes,
    intervalDays: props.intervalDays,
    completedInteractionId: props.completedInteractionId,
    cancelReason: props.cancelReason,
    dueNotifiedAt: props.dueNotifiedAt,
    updatedAt: props.updatedAt,
  };
}
