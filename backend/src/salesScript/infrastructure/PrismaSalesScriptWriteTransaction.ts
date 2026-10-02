import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import {
  ISalesScriptWrites,
  ISalesScriptWriteTransaction,
  SalesScriptWriteRepos,
  ScriptContent,
} from '../application/ports/ISalesScriptWriteTransaction';
import { SalesScriptConflictError } from '../domain/errors';
import { SalesScriptStatus } from '../domain/SalesScript';
import { PrismaSalesScriptStore } from './PrismaSalesScriptStore';
import { richTextData, richTextJson } from './prismaSalesScriptRows';

class PrismaSalesScriptWrites extends PrismaSalesScriptStore implements ISalesScriptWrites {
  async createDraft(
    tenantId: string,
    draft: ScriptContent & { id: string; version: number; createdByUserId: string | null }
  ): Promise<void> {
    await this.prisma.salesScript.create({
      data: {
        id: draft.id,
        tenantId,
        version: draft.version,
        status: SalesScriptStatus.Draft,
        liveSlot: SalesScriptStatus.Draft,
        contentSq: richTextJson(draft.contentSq),
        contentEn: richTextData(draft.contentEn),
        createdByUserId: draft.createdByUserId,
      },
    });
  }

  async updateDraft(tenantId: string, id: string, content: ScriptContent): Promise<void> {
    await this.prisma.salesScript.updateMany({
      where: { tenantId, id, status: SalesScriptStatus.Draft },
      data: { contentSq: richTextJson(content.contentSq), contentEn: richTextData(content.contentEn) },
    });
  }

  async supersede(tenantId: string, id: string): Promise<void> {
    await this.prisma.salesScript.updateMany({
      where: { tenantId, id },
      data: { status: SalesScriptStatus.Superseded, liveSlot: null },
    });
  }

  async publish(tenantId: string, id: string, by: { publishedByUserId: string | null; publishedAt: Date }): Promise<void> {
    await this.prisma.salesScript.updateMany({
      where: { tenantId, id, status: SalesScriptStatus.Draft },
      data: { status: SalesScriptStatus.Published, liveSlot: SalesScriptStatus.Published, ...by },
    });
  }
}

export class PrismaSalesScriptWriteTransaction implements ISalesScriptWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // publish back (FR-AUD-09), as in PrismaPricingWriteTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: SalesScriptWriteRepos) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const client = tx as unknown as PrismaClient;
        return work({ scripts: new PrismaSalesScriptWrites(client), auditTrail: this.auditTrailFor(client) });
      });
    } catch (error) {
      // A second draft or published version, or a version number taken by a
      // concurrent write: (tenantId, liveSlot) and (tenantId, version) are unique.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SalesScriptConflictError();
      }
      throw error;
    }
  }
}
