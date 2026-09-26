import { PrismaClient } from '@prisma/client';
import {
  IContractRepository,
  ContractFilters,
  PaginatedContracts,
} from '../../domain/IContractRepository';
import { BillingPeriod, Contract, ContractStatus } from '../../domain/Contract';
import { PaymentStatus } from '../../domain/ContractPayment';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

/** The payment columns the rollup needs. Kept narrow so list reads stay cheap. */
const PAYMENT_ROLLUP_SELECT = {
  select: { amount: true, paidAmount: true, status: true, dueDate: true },
} as const;

export class PrismaContractRepository implements IContractRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Rolls a contract's payment rows up into the totals the UI shows.
   *
   * Done in memory over the joined rows rather than as a database aggregate
   * because WAIVED has to be excluded from what is owed but not from what was
   * scheduled — a `SUM(amount) - SUM(paidAmount)` would report a waived month
   * as arrears. The rule lives once, in `ContractPayment.outstanding`, and
   * this mirrors it on the shape Prisma returns.
   */
  private rollup(payments: Array<{ amount: number; paidAmount: number; status: string; dueDate: Date }>, now: Date) {
    let total = 0;
    let paid = 0;
    let outstanding = 0;
    let unpaidCount = 0;
    let overdueCount = 0;

    for (const p of payments) {
      total += p.amount;
      paid += p.paidAmount;

      const owed = p.status === PaymentStatus.Waived ? 0 : Math.max(0, p.amount - p.paidAmount);
      outstanding += owed;

      if (owed > 0) {
        unpaidCount += 1;
        if (p.dueDate.getTime() < now.getTime()) overdueCount += 1;
      }
    }

    return {
      // Money rounded at the boundary, not carried out as a long binary tail.
      total: Number(total.toFixed(2)),
      paid: Number(paid.toFixed(2)),
      outstanding: Number(outstanding.toFixed(2)),
      unpaidCount,
      overdueCount,
    };
  }

  private toDomain(raw: any): Contract {
    return Contract.create({
      id: raw.id,
      tenantId: raw.tenantId,
      clientId: raw.clientId,
      clientName: raw.client?.name ?? undefined,
      assignedUserId: raw.assignedUserId,
      planName: raw.planName,
      status: raw.status as ContractStatus,
      amount: raw.amount,
      billingPeriod: raw.billingPeriod as BillingPeriod,
      startsAt: raw.startsAt,
      endsAt: raw.endsAt,
      notes: raw.notes,
      documentUrl: raw.documentUrl,
      documentName: raw.documentName,
      renewedFromContractId: raw.renewedFromContractId,
      activatedAt: raw.activatedAt,
      cancelledAt: raw.cancelledAt,
      expiryNotifiedAt: raw.expiryNotifiedAt,
      createdByUserId: raw.createdByUserId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      // `undefined` rather than a zeroed summary when the caller did not join
      // payments — see the note on Contract.paymentSummary.
      paymentSummary: raw.payments ? this.rollup(raw.payments, new Date()) : undefined,
    });
  }

  async findById(tenantId: string, id: string): Promise<Contract | null> {
    const raw = await this.prisma.contract.findUnique({
      where: { id },
      include: { client: { select: { name: true } }, payments: PAYMENT_ROLLUP_SELECT },
    });

    if (!raw || raw.tenantId !== tenantId) {
      return null;
    }

    return this.toDomain(raw);
  }

  async findByClientId(tenantId: string, clientId: string): Promise<Contract[]> {
    const rows = await this.prisma.contract.findMany({
      where: { tenantId, clientId },
      include: { client: { select: { name: true } }, payments: PAYMENT_ROLLUP_SELECT },
      // Newest term first: the current one is what somebody opening a client
      // is nearly always looking for, and history reads downward from it.
      orderBy: { startsAt: 'desc' },
    });

    return rows.map((raw) => this.toDomain(raw));
  }

  async search(filters: ContractFilters): Promise<PaginatedContracts> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: filters.tenantId };

    if (filters.status) where.status = filters.status;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;

    if (filters.expiringWithinDays !== undefined) {
      const horizon = new Date(Date.now() + filters.expiringWithinDays * 24 * 60 * 60 * 1000);
      // Only ACTIVE terms can be "expiring": a cancelled or already-expired
      // one ending this week is not a renewal opportunity, it is history.
      where.status = ContractStatus.Active;
      where.endsAt = { gte: new Date(), lte: horizon };
    }

    if (filters.query) {
      where.OR = [
        { id: insensitiveContains(filters.query) },
        { planName: insensitiveContains(filters.query) },
        { client: { name: insensitiveContains(filters.query) } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        include: { client: { select: { name: true } }, payments: PAYMENT_ROLLUP_SELECT },
        skip,
        take: limit,
        // Soonest expiry first when that is what was asked for — the renewals
        // view is a worklist, and the most urgent row belongs at the top.
        orderBy:
          filters.expiringWithinDays !== undefined ? { endsAt: 'asc' } : { createdAt: 'desc' },
      }),
    ]);

    return { data: rows.map((raw) => this.toDomain(raw)), total };
  }

  async save(contract: Contract): Promise<void> {
    const mutable = {
      assignedUserId: contract.assignedUserId,
      planName: contract.planName,
      status: contract.status,
      amount: contract.amount,
      billingPeriod: contract.billingPeriod,
      startsAt: contract.startsAt,
      endsAt: contract.endsAt,
      notes: contract.notes,
      documentUrl: contract.documentUrl,
      documentName: contract.documentName,
      activatedAt: contract.activatedAt,
      cancelledAt: contract.cancelledAt,
      expiryNotifiedAt: contract.expiryNotifiedAt,
    };

    await this.prisma.contract.upsert({
      where: { id: contract.id },
      update: mutable,
      create: {
        id: contract.id,
        tenantId: contract.tenantId,
        clientId: contract.clientId,
        createdByUserId: contract.createdByUserId,
        // Only settable at creation: a term cannot later be reassigned to have
        // renewed a different one.
        renewedFromContractId: contract.renewedFromContractId,
        ...mutable,
      },
    });
  }
}
