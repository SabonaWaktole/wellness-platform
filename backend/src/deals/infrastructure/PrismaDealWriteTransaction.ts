import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import { DealWriteRepos, IDealWriteTransaction } from '../application/ports/IDealWriteTransaction';
import { PrismaDealWrites } from './PrismaDealWrites';

export class PrismaDealWriteTransaction implements IDealWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // deal change back, as PrismaClientWriteTransaction does.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: DealWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ deals: new PrismaDealWrites(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
