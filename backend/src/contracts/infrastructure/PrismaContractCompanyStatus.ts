import { Prisma, PrismaClient } from '@prisma/client';
import { IContractCompanyStatus } from '../application/ports/IContractCompanyStatus';

/**
 * Same write as winning a deal (`PrismaDealWrites.makeClient`): the STATUS
 * field's value and the company's status column are both set to Client.
 */
export class PrismaContractCompanyStatus implements IContractCompanyStatus {
  constructor(private prisma: PrismaClient) {}

  async makeClient(tenantId: string, clientId: string): Promise<{ previous: string | null } | null> {
    const row = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null } });
    if (!row) return null;
    const definition = await this.prisma.customFieldDefinition.findFirst({ where: { tenantId, role: 'STATUS' } });
    const values = (typeof row.customFieldValues === 'string' ? JSON.parse(row.customFieldValues) : row.customFieldValues ?? {}) as Record<string, unknown>;
    const previous = (definition ? (values[definition.fieldName] as string | undefined) : undefined) ?? row.status ?? null;
    if (previous === 'CLIENT') return null;
    if (definition) values[definition.fieldName] = 'CLIENT';
    await this.prisma.client.updateMany({
      where: { id: clientId, tenantId },
      data: { status: 'CLIENT', customFieldValues: values as Prisma.InputJsonObject },
    });
    return { previous };
  }
}
