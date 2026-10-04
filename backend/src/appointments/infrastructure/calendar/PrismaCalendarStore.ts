import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { CalendarItem, CalendarKind } from '../../application/calendar/calendarViews';
import { CalendarFilters, ICalendarStore } from '../../application/calendar/ports/ICalendarStore';

const OPEN = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];
/** A cancelled item is not on the calendar; a completed one stays, struck through. */
const SHOWN = [...OPEN, AppointmentStatus.COMPLETED];

const personName = { select: { firstName: true, lastName: true, email: true } } as const;

/** One query with the joins the views need, so no company, deal or contact name costs a query of its own. */
const CALENDAR_INCLUDE = {
  client: { select: { name: true } },
  deal: { select: { title: true, type: true } },
  contactPerson: { select: { name: true } },
  assignedUser: personName,
} satisfies Prisma.AppointmentInclude;

type Row = Prisma.AppointmentGetPayload<{ include: typeof CALENDAR_INCLUDE }>;

function displayName(user: { firstName: string | null; lastName: string | null; email: string }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function toItem(row: Row): Omit<CalendarItem, 'isOverdue'> {
  return {
    id: row.id,
    kind: row.kind as CalendarKind,
    type: row.type,
    status: row.status as AppointmentStatus,
    scheduledAt: row.scheduledAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    place: row.place,
    notes: row.notes,
    clientId: row.clientId,
    companyName: row.client.name ?? '',
    dealId: row.dealId,
    dealTitle: row.deal?.title ?? null,
    dealType: row.deal?.type ?? null,
    contactPersonId: row.contactPersonId,
    contactName: row.contactPerson?.name ?? null,
    assignedUserId: row.assignedUserId,
    assignedUserName: displayName(row.assignedUser),
  };
}

/**
 * The calendar, on the `(tenantId, assignedUserId, status, scheduledAt)` and
 * `(tenantId, scheduledAt)` indexes. The scope is always part of the WHERE
 * clause, on the salesperson, which is never NULL.
 */
export class PrismaCalendarStore implements ICalendarStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private where(tenantId: string, scope: RecordScope, filters: CalendarFilters, status: string[]): Prisma.AppointmentWhereInput {
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      status: { in: status },
      AND: [ownerWhere(scope, 'assignedUserId', { nullable: false })],
    };
    // Asking for someone outside the scope narrows to nothing: the scope is ANDed on.
    if (filters.userIds?.length) where.assignedUserId = { in: filters.userIds };
    if (filters.kinds?.length) where.kind = { in: filters.kinds };
    if (filters.types?.length) where.type = { in: filters.types };
    return where;
  }

  async inRange(tenantId: string, scope: RecordScope, filters: CalendarFilters, from: Date, to: Date, limit: number) {
    const rows = await this.prisma.appointment.findMany({
      where: { ...this.where(tenantId, scope, filters, SHOWN), scheduledAt: { gte: from, lt: to } },
      include: CALENDAR_INCLUDE,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toItem);
  }

  async openBefore(tenantId: string, scope: RecordScope, filters: CalendarFilters, before: Date, limit: number) {
    const rows = await this.prisma.appointment.findMany({
      where: { ...this.where(tenantId, scope, filters, OPEN), scheduledAt: { lt: before } },
      include: CALENDAR_INCLUDE,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toItem);
  }
}
