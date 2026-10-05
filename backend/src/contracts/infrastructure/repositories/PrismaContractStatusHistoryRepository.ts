import { PrismaClient } from '@prisma/client';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';

export class PrismaContractStatusHistoryRepository implements IContractStatusHistoryRepository {
  constructor(private prisma: PrismaClient) {}

  async findByContractId(tenantId: string, contractId: string): Promise<ContractStatusHistory[]> {
    const raw = await this.prisma.contractStatusHistory.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: 'asc' },
    });

    return raw.map((h) =>
      ContractStatusHistory.create({
        id: h.id,
        tenantId: h.tenantId,
        contractId: h.contractId,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedByUserId: h.changedByUserId,
        note: h.note ?? undefined,
        changedAt: h.createdAt,
      })
    );
  }

  async save(history: ContractStatusHistory): Promise<void> {
    await this.prisma.contractStatusHistory.create({
      data: {
        id: history.id,
        tenantId: history.tenantId,
        contractId: history.contractId,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        changedByUserId: history.changedByUserId,
        note: history.note,
        createdAt: history.changedAt,
      },
    });
  }
}
