import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../shared/infrastructure/prisma/client';
import { addDays } from '../contracts/domain/calendarDay';
import { OPEN_DEAL_STAGES } from '../deals/domain/DealStage';
import {
  ISchedulerQueries,
  DueAppointment,
  StaleQuotation,
  PastDueInvoice,
  ExpiringContract,
  ExpiredContractNotice,
  OverduePaymentNotice,
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
        // A follow-up has its own notice at its due time (FollowUpDueJob, FR-FUP-09).
        kind: { not: 'FOLLOW_UP' },
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

  async listSalesProcessTenants(): Promise<{ id: string; timeZone: string }[]> {
    const rows = await this.prisma.tenant.findMany({ where: { salesWorkflow: 'SALES_PROCESS' }, select: { id: true, timezone: true } });
    return rows.map((row) => ({ id: row.id, timeZone: row.timezone }));
  }

  async findOffersPastValidity(tenantId: string, today: string): Promise<{ id: string; tenantId: string }[]> {
    return this.prisma.quotation.findMany({
      where: {
        tenantId,
        status: 'SENT',
        dealId: { not: null },
        supersededAt: null,
        // A @db.Date column: before today's date means the last valid day has passed.
        validUntil: { lt: new Date(`${today}T00:00:00.000Z`) },
      },
      select: { id: true, tenantId: true },
      orderBy: { validUntil: 'asc' },
      take: SWEEP_LIMIT,
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
        // Offers (M2) expire on their validity date and are followed up by
        // hand (FR-OFR-13, Slice 11), not by these legacy sweeps.
        dealId: null,
        ...extraWhere,
      },
      select: {
        id: true,
        number: true,
        version: true,
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
      number: r.number,
      version: r.version,
      tenantId: r.tenantId,
      createdByUserId: r.createdByUserId,
      // Non-null by the `sentAt: { not: null }` filter above; Prisma's type
      // cannot express that, so it is asserted here rather than at four call
      // sites downstream.
      sentAt: r.sentAt as Date,
      clientName: r.client.name ?? 'Client',
    }));
  }

  /** Columns every contract sweep needs. Declared once so the two agree. */
  private static readonly CONTRACT_SELECT = {
    id: true,
    tenantId: true,
    clientId: true,
    planName: true,
    endsAt: true,
    assignedUserId: true,
    createdByUserId: true,
    client: { select: { name: true } },
  } as const;

  private toExpiringContract(row: any): ExpiringContract {
    return {
      id: row.id,
      tenantId: row.tenantId,
      clientId: row.clientId,
      clientName: row.client.name ?? 'Client',
      planName: row.planName,
      endsAt: row.endsAt,
      assignedUserId: row.assignedUserId,
      createdByUserId: row.createdByUserId,
    };
  }

  async listTenants(): Promise<{ id: string; timeZone: string }[]> {
    const rows = await this.prisma.tenant.findMany({ select: { id: true, timezone: true } });
    return rows.map((row) => ({ id: row.id, timeZone: row.timezone }));
  }

  async findContractsPastEnd(tenantId: string, today: Date): Promise<{ id: string; tenantId: string }[]> {
    return this.prisma.contract.findMany({
      where: { tenantId, status: 'ACTIVE', endsAt: { lt: today } },
      select: { id: true, tenantId: true },
      orderBy: { endsAt: 'asc' },
      take: SWEEP_LIMIT,
    });
  }

  async findExpiredAwaitingNotice(tenantId: string, since: Date): Promise<ExpiredContractNotice[]> {
    const rows = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: 'EXPIRED',
        renewedInto: null,
        // The system's own Expired entry, so a contract an old release or a
        // person moved to Expired is not announced as the job's doing.
        statusHistory: { some: { toStatus: 'EXPIRED', changedByUserId: null, createdAt: { gte: since } } },
      },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        planName: true,
        number: true,
        endsAt: true,
        assignedUserId: true,
        createdByUserId: true,
        client: { select: { name: true, assignedUserId: true } },
      },
      orderBy: { endsAt: 'asc' },
      take: SWEEP_LIMIT,
    });
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const told = await this.prisma.notification.findMany({
      where: { tenantId, type: 'CONTRACT_EXPIRED', entityType: 'CONTRACT', entityId: { in: ids } },
      select: { entityId: true },
    });
    const toldIds = new Set(told.map((row) => row.entityId));

    const renewing = await this.prisma.deal.findMany({
      where: {
        tenantId,
        type: 'RENEWAL',
        deletedAt: null,
        stageKey: { in: [...OPEN_DEAL_STAGES] },
        clientId: { in: rows.map((row) => row.clientId) },
      },
      select: { clientId: true },
    });
    const renewingClients = new Set(renewing.map((row) => row.clientId));

    return rows
      .filter((row) => !toldIds.has(row.id) && !renewingClients.has(row.clientId))
      .map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        clientName: row.client.name ?? 'Client',
        planName: row.planName,
        number: row.number ?? null,
        endsAt: row.endsAt,
        assignedUserId: row.assignedUserId,
        clientAssignedUserId: row.client.assignedUserId ?? null,
        createdByUserId: row.createdByUserId,
      }));
  }

  async getPaymentGraceDays(tenantId: string): Promise<number> {
    const row = await this.prisma.contractSettings.findUnique({ where: { tenantId }, select: { paymentGraceDays: true } });
    return row?.paymentGraceDays ?? 0;
  }

  async findPaymentsPastDue(tenantId: string, today: Date, graceDays: number): Promise<{ id: string; tenantId: string }[]> {
    return this.prisma.contractPayment.findMany({
      where: {
        tenantId,
        status: { in: ['INVOICE_ISSUED', 'PAYMENT_PENDING', 'PARTIALLY_PAID'] },
        // dueDate + graceDays < today
        dueDate: { lt: addDays(today, -graceDays) },
      },
      select: { id: true, tenantId: true },
      orderBy: { dueDate: 'asc' },
      take: SWEEP_LIMIT,
    });
  }

  async findOverdueAwaitingNotice(tenantId: string): Promise<OverduePaymentNotice[]> {
    const rows = await this.prisma.contractPayment.findMany({
      where: { tenantId, status: 'OVERDUE', overdueNotifiedAt: null },
      select: {
        id: true,
        tenantId: true,
        contractId: true,
        periodIndex: true,
        dueDate: true,
        contract: {
          select: {
            planName: true,
            number: true,
            assignedUserId: true,
            createdByUserId: true,
            client: { select: { name: true, assignedUserId: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: SWEEP_LIMIT,
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      contractId: row.contractId,
      periodIndex: row.periodIndex,
      dueDate: row.dueDate,
      clientName: row.contract.client.name ?? 'Client',
      planName: row.contract.planName,
      number: row.contract.number ?? null,
      assignedUserId: row.contract.assignedUserId,
      clientAssignedUserId: row.contract.client.assignedUserId ?? null,
      createdByUserId: row.contract.createdByUserId,
    }));
  }

  async markPaymentOverdueNotified(paymentId: string, at: Date): Promise<void> {
    await this.prisma.contractPayment.update({ where: { id: paymentId }, data: { overdueNotifiedAt: at } });
  }

  async findContractsNearingExpiry(now: Date, days: number): Promise<ExpiringContract[]> {
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60_000);

    const rows = await this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        expiryNotifiedAt: null,
        // `gte: now` keeps this sweep off contracts that have already lapsed —
        // those belong to findContractsPastEnd, and warning that something
        // "expires soon" after it already has would be worse than silence.
        endsAt: { gte: now, lte: horizon },
      },
      select: PrismaSchedulerQueries.CONTRACT_SELECT,
      orderBy: { endsAt: 'asc' },
      take: SWEEP_LIMIT,
    });

    return rows.map((row) => this.toExpiringContract(row));
  }

  async markContractExpiryNotified(contractId: string, at: Date): Promise<void> {
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { expiryNotifiedAt: at },
    });
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
