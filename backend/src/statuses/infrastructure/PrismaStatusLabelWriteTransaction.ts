import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import { IStatusLabelWriteTransaction, IStatusLabelWrites, StatusLabelWriteRepos } from '../application/ports/IStatusLabelWriteTransaction';
import { StatusDomain } from '../domain/StatusCatalogue';
import { StatusLabel } from '../domain/StatusLabel';

class PrismaStatusLabelWrites implements IStatusLabelWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(tenantId: string, domain: StatusDomain, item: StatusLabel): Promise<void> {
    const key = { tenantId_domain_key: { tenantId, domain, key: item.key } };
    const fields = { labelSq: item.labelSq, labelEn: item.labelEn, colour: item.colour, order: item.order };
    await this.prisma.statusLabel.upsert({
      where: key,
      create: { tenantId, domain, key: item.key, ...fields },
      update: fields,
    });
  }
}

export class PrismaStatusLabelWriteTransaction implements IStatusLabelWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // status label change back (FR-AUD-04), as in PrismaLookupWriteTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: StatusLabelWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ statusLabels: new PrismaStatusLabelWrites(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
