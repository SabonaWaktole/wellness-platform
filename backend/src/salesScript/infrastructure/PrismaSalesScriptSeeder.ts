import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ISalesScriptSeeder } from '../application/ports/ISalesScriptSeeder';
import { DEFAULT_SALES_SCRIPT } from '../domain/DefaultSalesScript';
import { SalesScriptStatus } from '../domain/SalesScript';
import { richTextData, richTextJson } from './prismaSalesScriptRows';

/** Publishes the placeholder script as version 1, as the migrations do for existing workspaces. */
export class PrismaSalesScriptSeeder implements ISalesScriptSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(tenantId: string): Promise<void> {
    await this.prisma.salesScript.create({
      data: {
        id: randomUUID(),
        tenantId,
        version: 1,
        status: SalesScriptStatus.Published,
        liveSlot: SalesScriptStatus.Published,
        contentSq: richTextJson(DEFAULT_SALES_SCRIPT.contentSq),
        contentEn: richTextData(DEFAULT_SALES_SCRIPT.contentEn),
        publishedAt: new Date(),
      },
    });
  }
}
