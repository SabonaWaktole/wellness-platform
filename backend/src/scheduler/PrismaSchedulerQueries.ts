import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../shared/infrastructure/prisma/client';
import {
  ISchedulerQueries,
  DueAppointment,
  StaleQuotation,
  PastDueInvoice,
} from './ISchedulerQueries';

/** Rows a sweep will consider in one pass. Bounds the blast radius of a backlog. */
const SWEEP_LIMIT = 500;

export class PrismaSchedulerQueries implements ISchedulerQueries {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findAppointmentsDueReminder(
    tenantId: string,
    now: Date,
    leadMinutes: number
  ): Promise<DueAppointment[]> {
    const horizon = new Date(now.getTime() + leadMinutes * 60_000);

    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        remindedAt: null,
        // Upcoming only. `gte: now` is what stops a sweep after downtime from
        // mailing everyone about appointments that already happened — a
        // restart should catch up on work that is still useful, not spam.
        scheduledAt: { gte: now, lte: horizon },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      select: {
        id: true,
        tenantId: true,
        assignedUserId: true,
        scheduledAt: true,
        client: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: SWEEP_LIMIT,
    });

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      assignedUserId: r.assignedUserId,
      scheduledAt: r.scheduledAt,
      clientName: r.client.name ?? 'Client',
    }));
  }

  async markAppointmentReminded(appointmentId: string, at: Date): Promise<void> {
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { remindedAt: at },
    });
  }

  async findQuotationsNeedingFollowUp(
    tenantId: string,
    now: Date,
    days: number
  ): Promise<StaleQuotation[]> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60_000);
    return this.findStale(tenantId, cutoff, { followUpSentAt: null });
  }

  async markQuotationFollowedUp(quotationId: string, at: Date): Promise<void> {
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { followUpSentAt: at },
    });
  }

  async findQuotationsDueExpiry(
    tenantId: string,
    now: Date,
    days: number
  ): Promise<StaleQuotation[]> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60_000);
    return this.findStale(tenantId, cutoff, {});
  }

  /**
   * Shared shape of "sent, unanswered, and older than a cutoff".
   *
   * Follow-up and expiry differ only in the cutoff and in whether a marker
   * column applies, so the selection lives once. Writing it twice is how the
   * two sweeps drift apart on what counts as unanswered.
   */
  private async findStale(
    tenantId: string,
    cutoff: Date,
    extraWhere: Record<string, unknown>
  ): Promise<StaleQuotation[]> {
    const rows = await this.prisma.quotation.findMany({
      where: {
        tenantId,
        status: 'SENT',
        respondedAt: null,
        sentAt: { not: null, lte: cutoff },
        ...extraWhere,
      },
      select: {
        id: true,
        tenantId: true,
        createdByUserId: true,
        sentAt: true,
        client: { select: { name: true } },
      },
      orderBy: { sentAt: 'asc' },
      take: SWEEP_LIMIT,
    });

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      createdByUserId: r.createdByUserId,
      // Non-null by the `sentAt: { not: null }` filter above; Prisma's type
      // cannot express that, so it is asserted here rather than at four call
      // sites downstream.
      sentAt: r.sentAt as Date,
      clientName: r.client.name ?? 'Client',
    }));
  }

  async findInvoicesPastDue(now: Date): Promise<PastDueInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        status: 'SENT',
        dueDate: { lt: now },
      },
      select: { id: true, tenantId: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
      take: SWEEP_LIMIT,
    });

    return rows;
  }
}
