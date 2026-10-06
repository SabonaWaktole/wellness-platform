import { PrismaClient } from '@prisma/client';
import { dayKeyInZone } from '../../shared/domain/time/tenantDay';
import { IContractNumbers } from '../application/ports/IContractNumbers';
import { formatContractNumber } from '../domain/contractReference';

/** The kind of document the contract numbers count (D3). */
export const CONTRACT_SEQUENCE = 'CONTRACT';

/**
 * Contract numbers from DocumentSequence, as offer numbers are (FR-CON-05, D3):
 * the year's row is created if missing (`skipDuplicates`, so two first
 * contracts of a year cannot collide) and then incremented, which takes the
 * row's lock until the transaction ends. The prefix is the workspace's contract
 * setting (CTR by default).
 */
export class PrismaContractNumbers implements IContractNumbers {
  constructor(private readonly prisma: PrismaClient) {}

  async next(tenantId: string, now: Date): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, contractSettings: { select: { numberPrefix: true } } },
    });
    const year = Number(dayKeyInZone(now, tenant?.timezone ?? 'UTC').slice(0, 4));
    const key = { tenantId, kind: CONTRACT_SEQUENCE, year };
    await this.prisma.documentSequence.createMany({ data: [{ ...key, next: 1 }], skipDuplicates: true });
    const row = await this.prisma.documentSequence.update({
      where: { tenantId_kind_year: key },
      data: { next: { increment: 1 } },
    });
    return formatContractNumber(tenant?.contractSettings?.numberPrefix ?? 'CTR', year, row.next - 1);
  }
}
