import { PrismaClient, Prisma } from '@prisma/client';
import { IAppointmentRepository, SearchAppointmentsFilters } from '../../domain/repositories/IAppointmentRepository';
import { Appointment, RescheduleLog } from '../../domain/entities/Appointment';
import { AppointmentStatus } from '../../domain/enums/AppointmentStatus';
import { ALL_RECORDS, RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';

/** What an appointment needs from its neighbours: names to show, never written back. */
const APPOINTMENT_INCLUDE = {
  auditLogs: { orderBy: { createdAt: 'asc' } },
  client: { select: { name: true, email: true } },
  assignedUser: { select: { firstName: true, lastName: true, email: true } },
  deal: { select: { title: true, type: true } },
  contactPerson: { select: { name: true } },
} satisfies Prisma.AppointmentInclude;

export class PrismaAppointmentRepository implements IAppointmentRepository {
  constructor(private prisma: PrismaClient) {}

  private mapToDomain(record: any): Appointment {
    const history: RescheduleLog[] = (record.auditLogs || []).map((log: any) => ({
      id: log.id,
      previousDate: log.previousDate,
      newDate: log.newDate,
      reason: log.reason,
      changedBy: log.changedBy,
      createdAt: log.createdAt,
    }));

    // Reconstitute the Appointment using the static create method.
    // For reconstitution, we trust the DB state, so we pass the appointment's tenantId
    // as the clientTenantId and assignedUserTenantId to bypass cross-tenant validation errors.
    return Appointment.create({
      id: record.id,
      tenantId: record.tenantId,
      clientId: record.clientId,
      assignedUserId: record.assignedUserId,
      scheduledAt: record.scheduledAt,
      status: record.status as AppointmentStatus,
      kind: record.kind,
      type: record.type,
      dealId: record.dealId,
      contactPersonId: record.contactPersonId,
      endAt: record.endAt,
      place: record.place,
      notes: record.notes || undefined,
      history: history,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      clientTenantId: record.tenantId,
      assignedUserTenantId: record.tenantId,
      dealTitle: record.deal?.title ?? null,
      dealType: record.deal?.type ?? null,
      contactName: record.contactPerson?.name ?? null,
      clientName: record.client?.name,
      clientEmail: record.client?.email ?? undefined,
      staffName: record.assignedUser
        ? [record.assignedUser.firstName, record.assignedUser.lastName].filter(Boolean).join(' ') || record.assignedUser.email
        : undefined,
    });
  }

  async findById(id: string, tenantId: string): Promise<Appointment | null> {
    const record = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: APPOINTMENT_INCLUDE
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findByClientId(clientId: string, tenantId: string): Promise<Appointment[]> {
    const records = await this.prisma.appointment.findMany({
      where: { clientId, tenantId },
      include: APPOINTMENT_INCLUDE,
      orderBy: { scheduledAt: 'desc' }
    });
    return records.map(r => this.mapToDomain(r));
  }

  async findByDateRange(tenantId: string, startDate: Date, endDate: Date, filters?: SearchAppointmentsFilters): Promise<Appointment[]> {
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      }
    };

    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters?.status) where.status = filters.status;
    where.AND = [ownerWhere(filters?.scope ?? ALL_RECORDS, 'assignedUserId', { nullable: false })];

    const records = await this.prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: { scheduledAt: 'asc' }
    });

    return records.map(r => this.mapToDomain(r));
  }

  async findUpcoming(tenantId: string, scope: RecordScope = ALL_RECORDS, limit?: number): Promise<Appointment[]> {
    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      scheduledAt: { gt: new Date() },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      AND: [ownerWhere(scope, 'assignedUserId', { nullable: false })],
    };

    const records = await this.prisma.appointment.findMany({
      where,
      take: limit,
      include: APPOINTMENT_INCLUDE,
      orderBy: { scheduledAt: 'asc' }
    });

    return records.map(r => this.mapToDomain(r));
  }

  async findRecentByTenant(tenantId: string, limit: number, scope: RecordScope = ALL_RECORDS): Promise<Appointment[]> {
    const where: Prisma.AppointmentWhereInput = { tenantId, AND: [ownerWhere(scope, 'assignedUserId', { nullable: false })] };

    const records = await this.prisma.appointment.findMany({
      where,
      take: limit,
      include: APPOINTMENT_INCLUDE,
      orderBy: { updatedAt: 'desc' }
    });

    return records.map(r => this.mapToDomain(r));
  }

  async save(appointment: Appointment): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.create({
        data: {
          id: appointment.id,
          tenantId: appointment.tenantId,
          clientId: appointment.clientId,
          assignedUserId: appointment.assignedUserId,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          kind: appointment.kind,
          type: appointment.type,
          dealId: appointment.dealId,
          contactPersonId: appointment.contactPersonId,
          endAt: appointment.endAt,
          place: appointment.place,
          notes: appointment.notes,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt,
        }
      });

      if (appointment.history.length > 0) {
        await tx.appointmentAuditLog.createMany({
          data: appointment.history.map(log => ({
            appointmentId: appointment.id,
            previousDate: log.previousDate,
            newDate: log.newDate,
            reason: log.reason,
            changedBy: log.changedBy,
            createdAt: log.createdAt || new Date(),
          }))
        });
      }
    });
  }

  async update(appointment: Appointment): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      /*
       * Re-arm the reminder when the appointment moves.
       *
       * `remindedAt` means "the assignee has been told about THIS time". Once
       * the time changes that is no longer true, so leaving the marker set
       * would silently suppress the reminder for the new slot — the reschedule
       * notification fires immediately, and then nothing arrives the day
       * before. Clearing it here rather than in the use case keeps the marker's
       * meaning tied to the column it qualifies.
       *
       * The current value is read inside the same transaction rather than
       * trusted from the entity, because the entity was loaded before any of
       * this and its `scheduledAt` is the NEW value by the time we are called.
       */
      const stored = await tx.appointment.findUnique({
        where: { id: appointment.id },
        select: { scheduledAt: true },
      });
      const moved =
        stored !== null && stored.scheduledAt.getTime() !== appointment.scheduledAt.getTime();

      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          clientId: appointment.clientId,
          assignedUserId: appointment.assignedUserId,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          type: appointment.type,
          dealId: appointment.dealId,
          contactPersonId: appointment.contactPersonId,
          endAt: appointment.endAt,
          place: appointment.place,
          notes: appointment.notes,
          updatedAt: appointment.updatedAt,
          // A moved item is reminded again, and a moved follow-up is due-notified again.
          ...(moved ? { remindedAt: null, dueNotifiedAt: null } : {}),
        }
      });

      // Simple implementation: replace all logs
      await tx.appointmentAuditLog.deleteMany({
        where: { appointmentId: appointment.id }
      });

      if (appointment.history.length > 0) {
        await tx.appointmentAuditLog.createMany({
          data: appointment.history.map(log => ({
            appointmentId: appointment.id,
            previousDate: log.previousDate,
            newDate: log.newDate,
            reason: log.reason,
            changedBy: log.changedBy,
            createdAt: log.createdAt || new Date(),
          }))
        });
      }
    });
  }
}
