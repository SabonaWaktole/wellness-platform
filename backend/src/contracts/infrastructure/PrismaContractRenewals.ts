import { PrismaClient } from '@prisma/client';
import { IContractRenewals, RenewalContractRef, RenewalLinks } from '../application/ports/IContractRenewals';
import { contractReference } from '../domain/contractReference';

const ref = (row: { id: string; number: string | null }): RenewalContractRef => ({
  id: row.id,
  number: row.number ?? contractReference(row.id),
});

export class PrismaContractRenewals implements IContractRenewals {
  constructor(private readonly prisma: PrismaClient) {}

  async links(tenantId: string, contractId: string): Promise<RenewalLinks> {
    const row = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: {
        renewedFrom: { select: { id: true, number: true } },
        renewedInto: { select: { id: true, number: true } },
        renewalDeals: {
          where: { tenantId, deletedAt: null, stageKey: { notIn: ['WON', 'LOST'] } },
          select: { id: true },
          take: 1,
        },
      },
    });
    return {
      renewedFrom: row?.renewedFrom ? ref(row.renewedFrom) : null,
      renewedInto: row?.renewedInto ? ref(row.renewedInto) : null,
      openDealId: row?.renewalDeals[0]?.id ?? null,
    };
  }

  async lock(tenantId: string, contractId: string): Promise<boolean> {
    // An UPDATE takes the row lock on PostgreSQL and MySQL alike; it also has to
    // come before any read, so a MySQL snapshot is not taken before the lock is won.
    const result = await this.prisma.contract.updateMany({
      where: { id: contractId, tenantId },
      data: { updatedAt: new Date() },
    });
    return result.count === 1;
  }

  async isActiveUser(tenantId: string, userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, tenantId, isActive: true, deletedAt: null } })) > 0;
  }
}
