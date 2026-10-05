import { Prisma, PrismaClient } from '@prisma/client';
import { ownerWhere } from '../../../access/infrastructure/prismaRecordScope';
import { ALL_RECORDS } from '../../../access/domain/RecordScope';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';
import { Money } from '../../../pricing/domain/Money';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';
import {
  IPaymentOverviewReader,
  PaymentOverviewFilters,
  PaymentOverviewRow,
  PaymentOverviewTotals,
} from '../../application/ports/IPaymentOverviewReader';

const ROW_SELECT = {
  id: true,
  tenantId: true,
  contractId: true,
  periodIndex: true,
  dueDate: true,
  amount: true,
  status: true,
  paidAmount: true,
  paidAt: true,
  method: true,
  note: true,
  invoiceNumber: true,
  invoiceDate: true,
  createdAt: true,
  updatedAt: true,
  contract: {
    select: {
      id: true,
      number: true,
      planName: true,
      status: true,
      assignedUserId: true,
      client: {
        select: {
          id: true,
          name: true,
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ContractPaymentSelect;

type RawRow = Prisma.ContractPaymentGetPayload<{ select: typeof ROW_SELECT }>;

const person = (user: { id: string; firstName: string | null; lastName: string | null } | null | undefined) =>
  user ? { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id } : null;

const money = (value: Prisma.Decimal | null | undefined): Money => Money.of(value ? value.toString() : '0');

export class PrismaPaymentOverviewReader implements IPaymentOverviewReader {
  constructor(private prisma: PrismaClient) {}

  private where(filters: PaymentOverviewFilters): Prisma.ContractPaymentWhereInput {
    const contract: Prisma.ContractWhereInput[] = [{ client: ownerWhere(filters.scope ?? ALL_RECORDS, 'assignedUserId') }];
    if (filters.clientId) contract.push({ clientId: filters.clientId });
    if (filters.query) {
      contract.push({
        OR: [
          { number: insensitiveContains(filters.query) },
          { client: { name: insensitiveContains(filters.query) } },
        ],
      });
    }
    if (filters.areaId) contract.push({ client: { areaId: filters.areaId } });
    if (filters.cityId) contract.push({ client: { cityId: filters.cityId } });
    if (filters.assignedUserId) {
      contract.push({
        OR: [
          { assignedUserId: filters.assignedUserId },
          { assignedUserId: null, client: { assignedUserId: filters.assignedUserId } },
        ],
      });
    }

    const and: Prisma.ContractPaymentWhereInput[] = [{ contract: { AND: contract } }];
    if (filters.dueNotInvoiced) {
      and.push({ status: PaymentStatus.NotInvoiced, dueDate: { lt: filters.today } });
    } else if (filters.status) {
      and.push({ status: filters.status });
    }
    if (filters.contractId) and.push({ contractId: filters.contractId });
    if (filters.dueFrom || filters.dueTo) {
      and.push({
        dueDate: {
          ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
          ...(filters.dueTo ? { lte: filters.dueTo } : {}),
        },
      });
    }
    return { tenantId: filters.tenantId, AND: and };
  }

  private toRow(raw: RawRow): PaymentOverviewRow {
    const { contract } = raw;
    return {
      payment: ContractPayment.create({
        id: raw.id,
        tenantId: raw.tenantId,
        contractId: raw.contractId,
        periodIndex: raw.periodIndex,
        dueDate: raw.dueDate,
        amount: Number(Money.of(raw.amount.toString()).toString()),
        status: raw.status as PaymentStatus,
        paidAmount: Number(Money.of(raw.paidAmount.toString()).toString()),
        paidAt: raw.paidAt,
        method: raw.method,
        note: raw.note,
        invoiceNumber: raw.invoiceNumber,
        invoiceDate: raw.invoiceDate,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      }),
      contract: { id: contract.id, number: contract.number, planName: contract.planName, status: contract.status },
      client: { id: contract.client.id, name: contract.client.name ?? '' },
      salesperson: person(contract.assignedUser) ?? person(contract.client.assignedUser),
    };
  }

  /** Sums in the database. Outstanding leaves out waived instalments, which owe nothing. */
  private async totals(where: Prisma.ContractPaymentWhereInput): Promise<PaymentOverviewTotals> {
    const [all, owing] = await Promise.all([
      this.prisma.contractPayment.aggregate({ where, _sum: { amount: true, paidAmount: true } }),
      this.prisma.contractPayment.aggregate({
        where: { AND: [where, { status: { not: PaymentStatus.Waived } }] },
        _sum: { amount: true, paidAmount: true },
      }),
    ]);
    return {
      amount: money(all._sum.amount),
      received: money(all._sum.paidAmount),
      outstanding: money(owing._sum.amount).subtract(money(owing._sum.paidAmount)),
    };
  }

  async search(filters: PaymentOverviewFilters, page: { page: number; limit: number }) {
    const where = this.where(filters);
    const [total, rows, totals] = await Promise.all([
      this.prisma.contractPayment.count({ where }),
      this.prisma.contractPayment.findMany({
        where,
        select: ROW_SELECT,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.totals(where),
    ]);
    return { rows: rows.map((raw) => this.toRow(raw)), total, totals };
  }

  async *exportRows(filters: PaymentOverviewFilters, batchSize: number) {
    const where = this.where(filters);
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.contractPayment.findMany({
        where,
        select: ROW_SELECT,
        // The same order as the screen. `id` breaks ties so the cursor never skips or repeats a row.
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) return;
      yield rows.map((raw) => this.toRow(raw));
      if (rows.length < batchSize) return;
      cursor = rows[rows.length - 1].id;
    }
  }
}
