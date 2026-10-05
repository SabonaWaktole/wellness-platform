import { PrismaClient } from '@prisma/client';
import { ContractStatus } from '../domain/Contract';
import { IContractValidityReader } from '../application/ports/IContractValidityReader';
import { BadgeContract } from '../application/validityBadge';

/** One query for a whole page of companies; selects only status and dates, so no commercial field is read. */
export class PrismaContractValidityReader implements IContractValidityReader {
  constructor(private prisma: PrismaClient) {}

  async forClients(tenantId: string, clientIds: string[]): Promise<Map<string, BadgeContract[]>> {
    const byClient = new Map<string, BadgeContract[]>();
    if (clientIds.length === 0) return byClient;

    const rows = await this.prisma.contract.findMany({
      where: { tenantId, clientId: { in: clientIds } },
      select: { clientId: true, status: true, startsAt: true, endsAt: true },
    });
    for (const row of rows) {
      const list = byClient.get(row.clientId) ?? [];
      list.push({ status: row.status as ContractStatus, startsAt: row.startsAt, endsAt: row.endsAt });
      byClient.set(row.clientId, list);
    }
    return byClient;
  }
}
