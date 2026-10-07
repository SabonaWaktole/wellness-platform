import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { validityWhere } from '../../contracts/infrastructure/repositories/contractValidityWhere';
import type { PaymentMethod } from '../domain/memberPayment';
import type { TermSource } from '../domain/MemberTerm';
import type { Tier } from '../domain/Tier';
import type { PaymentKind } from '../domain/termDates';
import type {
  IMemberPaymentStore,
  MemberPaymentRecord,
  NewMemberPayment,
  NewPaymentTerm,
  PaymentFilters,
  PaymentTermRecord,
  TierHistoryEntry,
} from '../application/ports/IMemberPaymentStore';

const day = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);
const dateOnly = (value: string | null): Date | null => (value ? new Date(`${value}T00:00:00.000Z`) : null);

const PAYMENT_INCLUDE = { member: { select: { memberNumber: true, firstName: true, lastName: true } } } satisfies Prisma.MemberPaymentInclude;
type PaymentRow = Prisma.MemberPaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

const toRecord = (row: PaymentRow): MemberPaymentRecord => ({
  id: row.id,
  memberId: row.memberId,
  memberNumber: row.member.memberNumber,
  memberFirstName: row.member.firstName,
  memberLastName: row.member.lastName,
  kind: row.kind as PaymentKind,
  fromTier: row.fromTier as Tier,
  toTier: row.toTier as Tier,
  listFee: row.listFee.toFixed(2),
  discountPercent: row.discountPercent.toFixed(2),
  amount: row.amount.toFixed(2),
  method: row.method as PaymentMethod,
  receivedOn: day(row.receivedOn)!,
  receiptNumber: row.receiptNumber,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: row.createdAt,
  voidedAt: row.voidedAt,
  voidedBy: row.voidedBy,
  voidReason: row.voidReason,
});

export class PrismaMemberPaymentStore implements IMemberPaymentStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * A write of the row's own tenant id takes its lock in PostgreSQL and MySQL
   * alike, and holds it until the transaction ends. The second of two requests
   * for the same member waits here and then reads what the first one wrote.
   */
  async lockMember(tenantId: string, memberId: string): Promise<boolean> {
    const { count } = await this.prisma.member.updateMany({ where: { id: memberId, tenantId }, data: { tenantId } });
    return count > 0;
  }

  async listTerms(memberId: string): Promise<PaymentTermRecord[]> {
    const rows = await this.prisma.memberTerm.findMany({ where: { memberId }, orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((row) => ({
      id: row.id,
      tier: row.tier as Tier,
      source: row.source as TermSource,
      startsOn: day(row.startsOn)!,
      endsOn: day(row.endsOn),
      paymentId: row.paymentId,
      closedEarlyByPaymentId: row.closedEarlyByPaymentId,
      originalEndsOn: day(row.originalEndsOn),
      followsTermId: row.followsTermId,
    }));
  }

  async insertTerm(term: NewPaymentTerm): Promise<void> {
    await this.prisma.memberTerm.create({
      data: { id: term.id, memberId: term.memberId, tier: term.tier, source: term.source, startsOn: dateOnly(term.startsOn)!, endsOn: dateOnly(term.endsOn), paymentId: term.paymentId, followsTermId: term.followsTermId ?? null },
    });
  }

  async closeTermEarly(termId: string, endsOn: string, closedByPaymentId: string, originalEndsOn: string): Promise<void> {
    await this.prisma.memberTerm.update({
      where: { id: termId },
      data: { endsOn: dateOnly(endsOn), closedEarlyByPaymentId: closedByPaymentId, originalEndsOn: dateOnly(originalEndsOn) },
    });
  }

  async restoreTerm(termId: string, endsOn: string): Promise<void> {
    await this.prisma.memberTerm.update({
      where: { id: termId },
      data: { endsOn: dateOnly(endsOn), closedEarlyByPaymentId: null, originalEndsOn: null },
    });
  }

  async deleteTermsOfPayment(paymentId: string): Promise<void> {
    await this.prisma.memberTerm.deleteMany({ where: { paymentId } });
  }

  async endTermEarly(termId: string, endsOn: string, originalEndsOn: string): Promise<void> {
    await this.prisma.memberTerm.update({ where: { id: termId }, data: { endsOn: dateOnly(endsOn), originalEndsOn: dateOnly(originalEndsOn) } });
  }

  async deleteTerm(termId: string): Promise<void> {
    await this.prisma.memberTerm.delete({ where: { id: termId } });
  }

  async create(payment: NewMemberPayment): Promise<MemberPaymentRecord> {
    const row = await this.prisma.memberPayment.create({
      data: {
        id: payment.id,
        tenantId: payment.tenantId,
        memberId: payment.memberId,
        kind: payment.kind,
        fromTier: payment.fromTier,
        toTier: payment.toTier,
        listFee: payment.listFee,
        discountPercent: payment.discountPercent,
        amount: payment.amount,
        method: payment.method,
        receivedOn: dateOnly(payment.receivedOn)!,
        receiptNumber: payment.receiptNumber,
        note: payment.note,
        recordedBy: payment.recordedBy,
      },
      include: PAYMENT_INCLUDE,
    });
    return toRecord(row);
  }

  async find(tenantId: string, id: string): Promise<MemberPaymentRecord | null> {
    const row = await this.prisma.memberPayment.findFirst({ where: { id, tenantId }, include: PAYMENT_INCLUDE });
    return row ? toRecord(row) : null;
  }

  async latestActive(tenantId: string, memberId: string): Promise<MemberPaymentRecord | null> {
    const row = await this.prisma.memberPayment.findFirst({
      where: { tenantId, memberId, voidedAt: null },
      orderBy: [{ createdAt: 'desc' }, { receiptNumber: 'desc' }],
      include: PAYMENT_INCLUDE,
    });
    return row ? toRecord(row) : null;
  }

  async markVoided(tenantId: string, id: string, voidedAt: Date, voidedBy: string, reason: string): Promise<void> {
    await this.prisma.memberPayment.updateMany({ where: { id, tenantId }, data: { voidedAt, voidedBy, voidReason: reason } });
  }

  async listForMember(tenantId: string, memberId: string): Promise<MemberPaymentRecord[]> {
    const rows = await this.prisma.memberPayment.findMany({
      where: { tenantId, memberId },
      orderBy: [{ createdAt: 'desc' }, { receiptNumber: 'desc' }],
      include: PAYMENT_INCLUDE,
    });
    return rows.map(toRecord);
  }

  async search(tenantId: string, filters: PaymentFilters, page: number, limit: number) {
    const where: Prisma.MemberPaymentWhereInput = {
      tenantId,
      ...(filters.from || filters.to ? { receivedOn: { ...(filters.from ? { gte: dateOnly(filters.from)! } : {}), ...(filters.to ? { lte: dateOnly(filters.to)! } : {}) } } : {}),
      ...(filters.tier ? { toTier: filters.tier } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.method ? { method: filters.method } : {}),
      ...(filters.agentId ? { recordedBy: filters.agentId } : {}),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.status === 'RECORDED' ? { voidedAt: null } : filters.status === 'VOIDED' ? { voidedAt: { not: null } } : {}),
    };
    // The total is summed in the database as a Decimal and leaves out voided payments, whatever the status filter.
    const [total, rows, sum] = await this.prisma.$transaction([
      this.prisma.memberPayment.count({ where }),
      this.prisma.memberPayment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }, { receiptNumber: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.memberPayment.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } }),
    ]);
    return { data: rows.map(toRecord), total, totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
  }

  async setCurrentTier(tenantId: string, memberId: string, tier: Tier): Promise<void> {
    await this.prisma.member.updateMany({ where: { id: memberId, tenantId }, data: { currentTier: tier } });
  }

  async addTierHistory(entry: TierHistoryEntry): Promise<void> {
    const { effectiveOn, ...rest } = entry;
    await this.prisma.memberTierHistory.create({ data: { id: randomUUID(), ...rest, ...(effectiveOn ? { createdAt: dateOnly(effectiveOn)! } : {}) } });
  }

  async employerContractValid(tenantId: string, clientId: string, dayKey: string): Promise<boolean> {
    const today = dateOnly(dayKey)!;
    const count = await this.prisma.contract.count({ where: { tenantId, clientId, ...(validityWhere('VALID', today, 0) as Prisma.ContractWhereInput) } });
    return count > 0;
  }
}
