import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ISalesScriptStore } from '../application/ports/ISalesScriptStore';
import { SalesScriptStatus, SalesScriptVersion } from '../domain/SalesScript';
import { salesScriptFromRow, salesScriptInclude } from './prismaSalesScriptRows';

export class PrismaSalesScriptStore implements ISalesScriptStore {
  constructor(protected readonly prisma: PrismaClient = defaultPrisma) {}

  async published(tenantId: string): Promise<SalesScriptVersion | null> {
    return this.inSlot(tenantId, SalesScriptStatus.Published);
  }

  async draft(tenantId: string): Promise<SalesScriptVersion | null> {
    return this.inSlot(tenantId, SalesScriptStatus.Draft);
  }

  async version(tenantId: string, version: number): Promise<SalesScriptVersion | null> {
    const row = await this.prisma.salesScript.findUnique({
      where: { tenantId_version: { tenantId, version } },
      include: salesScriptInclude,
    });
    return row ? salesScriptFromRow(row) : null;
  }

  async publishedVersions(tenantId: string): Promise<SalesScriptVersion[]> {
    const rows = await this.prisma.salesScript.findMany({
      where: { tenantId, status: { in: [SalesScriptStatus.Published, SalesScriptStatus.Superseded] } },
      include: salesScriptInclude,
      orderBy: { version: 'desc' },
    });
    return rows.map(salesScriptFromRow);
  }

  async latestVersion(tenantId: string): Promise<number> {
    const { _max } = await this.prisma.salesScript.aggregate({ where: { tenantId }, _max: { version: true } });
    return _max.version ?? 0;
  }

  private async inSlot(tenantId: string, slot: SalesScriptStatus): Promise<SalesScriptVersion | null> {
    const row = await this.prisma.salesScript.findUnique({
      where: { tenantId_liveSlot: { tenantId, liveSlot: slot } },
      include: salesScriptInclude,
    });
    return row ? salesScriptFromRow(row) : null;
  }
}
