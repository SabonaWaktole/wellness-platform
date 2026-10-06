import { PrismaClient } from '@prisma/client';
import { Money } from '../../../pricing/domain/Money';
import { ContractPaymentHistoryEntry } from '../../domain/ContractPaymentHistory';
import { IContractPaymentHistoryRepository } from '../../domain/IContractPaymentHistoryRepository';

export class PrismaContractPaymentHistoryRepository implements IContractPaymentHistoryRepository {
  constructor(private prisma: PrismaClient) {}

  async findByPaymentId(tenantId: string, paymentId: string): Promise<ContractPaymentHistoryEntry[]> {
    const rows = await this.prisma.contractPaymentHistory.findMany({
      where: { tenantId, paymentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      paymentId: row.paymentId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      amountReceived: Money.of(String(row.amountReceived)),
      receivedOn: row.receivedOn,
      method: row.method,
      changedByUserId: row.changedByUserId,
      comment: row.comment,
      changedAt: row.createdAt,
    }));
  }

  async save(entry: ContractPaymentHistoryEntry): Promise<void> {
    await this.prisma.contractPaymentHistory.create({
      data: {
        id: entry.id,
        tenantId: entry.tenantId,
        paymentId: entry.paymentId,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        amountReceived: entry.amountReceived.toString(),
        receivedOn: entry.receivedOn,
        method: entry.method,
        changedByUserId: entry.changedByUserId,
        comment: entry.comment,
        createdAt: entry.changedAt,
      },
    });
  }
}
