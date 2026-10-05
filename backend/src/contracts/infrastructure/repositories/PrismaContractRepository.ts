import { Prisma, PrismaClient } from '@prisma/client';
import { ALL_RECORDS, RecordScope } from '../../../access/domain/RecordScope';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import {
  IContractRepository,
  ContractFilters,
  PaginatedContracts,
} from '../../domain/IContractRepository';
import { BillingPeriod, Contract, ContractStatus } from '../../domain/Contract';
import { PaymentStatus } from '../../domain/ContractPayment';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { Money } from '../../../pricing/domain/Money';
import { quotationReference } from '../../../quotations/domain/quotationReference';
import { validityWhere } from './contractValidityWhere';

/** Joined on every read: the company, and the deal, offer and package the contract names (FR-CON-06). */
const CONTRACT_INCLUDE = {
  client: { select: { name: true, assignedUserId: true } },
  package: { select: { nameSq: true } },
  deal: { select: { title: true } },
  quotation: { select: { number: true, version: true } },
} as const;

const text = (value: unknown): string | null => (value === null || value === undefined ? null : Money.of(String(value)).toString());

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
  private rollup(payments: Array<{ amount: unknown; paidAmount: unknown; status: string; dueDate: Date }>, now: Date) {
    let total = Money.zero();
    let paid = Money.zero();
    let outstanding = Money.zero();
    let unpaidCount = 0;
    let overdueCount = 0;

    for (const p of payments) {
      const amount = Money.of(String(p.amount));
      const received = Money.of(String(p.paidAmount));
      total = total.add(amount);
      paid = paid.add(received);

      const left = amount.subtract(received);
      const owed = p.status === PaymentStatus.Waived || left.isNegative() ? Money.zero() : left;
      outstanding = outstanding.add(owed);

      if (!owed.isZero()) {
        unpaidCount += 1;
        if (p.dueDate.getTime() < now.getTime()) overdueCount += 1;
      }
    }

    // Still numbers on the wire until Slice 8 reshapes instalments; the sums above are exact.
    return {
      total: Number(total.toString()),
      paid: Number(paid.toString()),
      outstanding: Number(outstanding.toString()),
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
      clientAssignedUserId: raw.client ? raw.client.assignedUserId : undefined,
      assignedUserId: raw.assignedUserId,
      planName: raw.planName,
      status: raw.status as ContractStatus,
      // Decimal(12,2) in the database (NFR-ACC-03); read through Money so it is exact.
      amount: Number(Money.of(String(raw.amount)).toString()),
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
      dealId: raw.dealId,
      quotationId: raw.quotationId,
      packageId: raw.packageId,
      packageName: raw.package?.nameSq ?? null,
      dealTitle: raw.deal?.title ?? null,
      quotationReference: raw.quotation ? quotationReference(raw.quotation) : null,
      servicesSnapshot: (raw.servicesSnapshot as Contract['servicesSnapshot']) ?? null,
      termsText: (raw.termsText as Contract['termsText']) ?? null,
      agreedAnnualValue: text(raw.agreedAnnualValue),
      discountPercent: text(raw.discountPercent),
      number: raw.number,
      renewalDate: raw.renewalDate,
      lockedAt: raw.lockedAt,
      suspendedAt: raw.suspendedAt,
      suspensionReason: raw.suspensionReason,
      cancelReason: raw.cancelReason,
      notRenewingReasonId: raw.notRenewingReasonId,
      notRenewingNote: raw.notRenewingNote,
      // `undefined` rather than a zeroed summary when the caller did not join
      // payments — see the note on Contract.paymentSummary.
      paymentSummary: raw.payments ? this.rollup(raw.payments, new Date()) : undefined,
    });
  }

  async findById(tenantId: string, id: string): Promise<Contract | null> {
    const raw = await this.prisma.contract.findUnique({
      where: { id },
      include: { ...CONTRACT_INCLUDE, payments: PAYMENT_ROLLUP_SELECT },
    });

    if (!raw || raw.tenantId !== tenantId) {
      return null;
    }

    return this.toDomain(raw);
  }

  async findByDealId(tenantId: string, dealId: string): Promise<Contract | null> {
    const raw = await this.prisma.contract.findFirst({
      where: { tenantId, dealId },
      include: { ...CONTRACT_INCLUDE, payments: PAYMENT_ROLLUP_SELECT },
    });
    return raw ? this.toDomain(raw) : null;
  }

  async findByClientId(tenantId: string, clientId: string, scope: RecordScope = ALL_RECORDS): Promise<Contract[]> {
    const rows = await this.prisma.contract.findMany({
      where: { tenantId, clientId, client: ownerWhere(scope, 'assignedUserId') },
      include: { ...CONTRACT_INCLUDE, payments: PAYMENT_ROLLUP_SELECT },
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

    const and: any[] = [{ client: ownerWhere(filters.scope ?? ALL_RECORDS, 'assignedUserId') }];
    const where: any = { tenantId: filters.tenantId, AND: and };

    if (filters.status) where.status = filters.status;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters.areaId) and.push({ client: { areaId: filters.areaId } });
    if (filters.cityId) and.push({ client: { cityId: filters.cityId } });
    if (filters.hasOverdue) and.push({ payments: { some: { status: PaymentStatus.Overdue } } });

    if (filters.endsFrom || filters.endsTo) {
      and.push({
        endsAt: {
          ...(filters.endsFrom ? { gte: filters.endsFrom } : {}),
          // The end date is a day: include the whole of the last day asked for.
          ...(filters.endsTo ? { lt: new Date(filters.endsTo.getTime() + 24 * 60 * 60 * 1000) } : {}),
        },
      });
    }

    if (filters.validity && filters.today) {
      and.push(validityWhere(filters.validity, filters.today, filters.expiringSoonDays ?? 30));
    }

    if (filters.expiringWithinDays !== undefined) {
      const horizon = new Date(Date.now() + filters.expiringWithinDays * 24 * 60 * 60 * 1000);
      // Only ACTIVE terms can be "expiring": a cancelled or already-expired
      // one ending this week is not a renewal opportunity, it is history.
      where.status = ContractStatus.Active;
      where.endsAt = { gte: new Date(), lte: horizon };
    }

    if (filters.query) {
      and.push({
        OR: [
          { id: insensitiveContains(filters.query) },
          { number: insensitiveContains(filters.query) },
          { planName: insensitiveContains(filters.query) },
          { client: { name: insensitiveContains(filters.query) } },
        ],
      });
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        include: { ...CONTRACT_INCLUDE, payments: PAYMENT_ROLLUP_SELECT },
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
      amount: Money.of(contract.amount).toString(),
      billingPeriod: contract.billingPeriod,
      startsAt: contract.startsAt,
      endsAt: contract.endsAt,
      notes: contract.notes,
      documentUrl: contract.documentUrl,
      documentName: contract.documentName,
      activatedAt: contract.activatedAt,
      cancelledAt: contract.cancelledAt,
      expiryNotifiedAt: contract.expiryNotifiedAt,
      quotationId: contract.quotationId,
      packageId: contract.packageId,
      servicesSnapshot: contract.servicesSnapshot === null ? Prisma.DbNull : (contract.servicesSnapshot as unknown as Prisma.InputJsonArray),
      termsText: contract.termsText === null ? Prisma.DbNull : (contract.termsText as unknown as Prisma.InputJsonObject),
      agreedAnnualValue: contract.agreedAnnualValue,
      discountPercent: contract.discountPercent,
      renewalDate: contract.renewalDate,
      lockedAt: contract.lockedAt,
      suspendedAt: contract.suspendedAt,
      suspensionReason: contract.suspensionReason,
      cancelReason: contract.cancelReason,
      notRenewingReasonId: contract.notRenewingReasonId,
      notRenewingNote: contract.notRenewingNote,
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
        // The deal and the number are fixed at creation: a contract cannot be
        // moved to another deal, and its number is never reissued (FR-CON-05).
        dealId: contract.dealId,
        number: contract.number,
        ...mutable,
      },
    });
  }
}
