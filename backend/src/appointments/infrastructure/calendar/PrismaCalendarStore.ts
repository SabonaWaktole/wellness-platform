import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { CalendarItem, CalendarKind, ContractCalendarItem, ContractCalendarKind } from '../../application/calendar/calendarViews';
import { contractReference } from '../../../contracts/domain/contractReference';
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

  /** A term that is in force or has ended: a Draft, a Pending Signature or a Cancelled one has no end to plan around. */
  private static readonly DATED_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED'];

  async contractDates(
    tenantId: string,
    scope: RecordScope,
    filters: { userIds?: string[]; kinds: ContractCalendarKind[] },
    fromDay: string,
    toDay: string,
    limit: number
  ): Promise<ContractCalendarItem[]> {
    const range = { gte: new Date(`${fromDay}T00:00:00.000Z`), lt: new Date(`${toDay}T00:00:00.000Z`) };
    const dated: Prisma.ContractWhereInput[] = [];
    if (filters.kinds.includes('CONTRACT_END')) dated.push({ endsAt: range });
    if (filters.kinds.includes('CONTRACT_RENEWAL')) dated.push({ renewalDate: range });
    if (dated.length === 0) return [];

    const and: Prisma.ContractWhereInput[] = [{ client: ownerWhere(scope, 'assignedUserId') }, { OR: dated }];
    // The responsible salesperson is the contract's, else the company's.
    if (filters.userIds?.length) {
      and.push({ OR: [{ assignedUserId: { in: filters.userIds } }, { assignedUserId: null, client: { assignedUserId: { in: filters.userIds } } }] });
    }

    const rows = await this.prisma.contract.findMany({
      where: { tenantId, status: { in: PrismaCalendarStore.DATED_STATUSES }, AND: and },
      select: {
        id: true,
        number: true,
        status: true,
        endsAt: true,
        renewalDate: true,
        clientId: true,
        assignedUser: { select: { id: true, ...personName.select } },
        client: { select: { name: true, assignedUser: { select: { id: true, ...personName.select } } } },
      },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    const inRange = (date: Date | null) => date !== null && date >= range.gte && date < range.lt;
    const items: ContractCalendarItem[] = [];
    for (const row of rows) {
      const person = row.assignedUser ?? row.client.assignedUser;
      const base = {
        contractId: row.id,
        number: row.number ?? contractReference(row.id),
        contractStatus: row.status,
        clientId: row.clientId,
        companyName: row.client.name ?? '',
        assignedUserId: person?.id ?? null,
        assignedUserName: person ? displayName(person) : null,
      };
      if (filters.kinds.includes('CONTRACT_END') && inRange(row.endsAt)) {
        items.push({ ...base, id: `${row.id}:END`, kind: 'CONTRACT_END', date: row.endsAt.toISOString().slice(0, 10) });
      }
      if (filters.kinds.includes('CONTRACT_RENEWAL') && inRange(row.renewalDate)) {
        items.push({ ...base, id: `${row.id}:RENEWAL`, kind: 'CONTRACT_RENEWAL', date: row.renewalDate!.toISOString().slice(0, 10) });
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
}
