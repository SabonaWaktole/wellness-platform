import { Prisma, PrismaClient } from '@prisma/client';
import { IContractCompanyStatus } from '../application/ports/IContractCompanyStatus';
import { OPEN_DEAL_STAGES } from '../../deals/domain/DealStage';

/**
 * Same write as winning a deal (`PrismaDealWrites.makeClient`): the STATUS
 * field's value and the company's status column are both set together.
 */
export class PrismaContractCompanyStatus implements IContractCompanyStatus {
  constructor(private prisma: PrismaClient) {}

  makeClient(tenantId: string, clientId: string) {
    return this.move(tenantId, clientId, 'CLIENT', () => true);
  }

  makeFormerClient(tenantId: string, clientId: string) {
    return this.move(tenantId, clientId, 'FORMER_CLIENT', (previous) => previous === 'CLIENT');
  }

  async hasOpenRenewalDeal(tenantId: string, clientId: string): Promise<boolean> {
    const open = await this.prisma.deal.count({
      where: { tenantId, clientId, type: 'RENEWAL', deletedAt: null, stageKey: { in: [...OPEN_DEAL_STAGES] } },
    });
    return open > 0;
  }

  private async move(
    tenantId: string,
    clientId: string,
    to: 'CLIENT' | 'FORMER_CLIENT',
    allowedFrom: (previous: string | null) => boolean
  ): Promise<{ previous: string | null } | null> {
    const row = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!row) return null;
    const definition = await this.prisma.customFieldDefinition.findFirst({ where: { tenantId, role: 'STATUS' } });
    const values = (typeof row.customFieldValues === 'string' ? JSON.parse(row.customFieldValues) : row.customFieldValues ?? {}) as Record<string, unknown>;
    const previous = (definition ? (values[definition.fieldName] as string | undefined) : undefined) ?? row.status ?? null;
    if (previous === to || !allowedFrom(previous)) return null;
    if (definition) values[definition.fieldName] = to;
    await this.prisma.client.updateMany({
      where: { id: clientId, tenantId },
      data: { status: to, customFieldValues: values as Prisma.InputJsonObject },
    });
    return { previous };
  }
}
