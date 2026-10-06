import { PrismaClient } from '@prisma/client';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { Money } from '../../../pricing/domain/Money';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';

export class PrismaContractPaymentRepository implements IContractPaymentRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(raw: any): ContractPayment {
    return ContractPayment.create({
      id: raw.id,
      tenantId: raw.tenantId,
      contractId: raw.contractId,
      periodIndex: raw.periodIndex,
      dueDate: raw.dueDate,
      // Decimal(12,2) in the database (NFR-ACC-03); read through Money so the number is exact.
      amount: Number(Money.of(String(raw.amount)).toString()),
      status: raw.status as PaymentStatus,
      paidAmount: Number(Money.of(String(raw.paidAmount)).toString()),
      paidAt: raw.paidAt,
      method: raw.method,
      note: raw.note,
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: raw.invoiceDate,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  async findById(tenantId: string, id: string): Promise<ContractPayment | null> {
    const raw = await this.prisma.contractPayment.findUnique({ where: { id } });
    if (!raw || raw.tenantId !== tenantId) return null;
    return this.toDomain(raw);
  }

  async findByContractId(tenantId: string, contractId: string): Promise<ContractPayment[]> {
    const rows = await this.prisma.contractPayment.findMany({
      where: { tenantId, contractId },
      // Chronological: a payment schedule is read forwards, unlike the
      // contract list which is read newest-first.
      orderBy: [{ dueDate: 'asc' }, { periodIndex: 'asc' }],
    });
    return rows.map((raw) => this.toDomain(raw));
  }

  async save(payment: ContractPayment): Promise<void> {
    const mutable = {
      periodIndex: payment.periodIndex,
      dueDate: payment.dueDate,
      amount: payment.amount,
      status: payment.status,
      paidAmount: payment.paidAmount,
      paidAt: payment.paidAt,
      method: payment.method,
      note: payment.note,
      invoiceNumber: payment.invoiceNumber,
      invoiceDate: payment.invoiceDate,
    };

    await this.prisma.contractPayment.upsert({
      where: { id: payment.id },
      update: mutable,
      create: {
        id: payment.id,
        tenantId: payment.tenantId,
        contractId: payment.contractId,
        ...mutable,
      },
    });
  }

  async saveMany(payments: ContractPayment[]): Promise<void> {
    if (payments.length === 0) return;

    // createMany rather than a loop of upserts: activation writes a whole
    // generated schedule, and these rows are new by construction — nothing
    // else has had a chance to create them inside the same transaction.
    await this.prisma.contractPayment.createMany({
      data: payments.map((payment) => ({
        id: payment.id,
        tenantId: payment.tenantId,
        contractId: payment.contractId,
        periodIndex: payment.periodIndex,
        dueDate: payment.dueDate,
        amount: payment.amount,
        status: payment.status,
        paidAmount: payment.paidAmount,
        paidAt: payment.paidAt,
        method: payment.method,
        note: payment.note,
        invoiceNumber: payment.invoiceNumber,
        invoiceDate: payment.invoiceDate,
      })),
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    // Tenant-scoped deleteMany rather than delete-by-id: a bare id would let a
    // caller in one workspace remove a row belonging to another if it ever
    // learned the id. The extra predicate costs nothing and closes that.
    await this.prisma.contractPayment.deleteMany({ where: { id, tenantId } });
  }

  async deleteNotInvoicedDueAfter(tenantId: string, contractId: string, day: Date): Promise<number> {
    const result = await this.prisma.contractPayment.deleteMany({
      where: { tenantId, contractId, status: PaymentStatus.NotInvoiced, dueDate: { gt: day } },
    });
    return result.count;
  }
}
