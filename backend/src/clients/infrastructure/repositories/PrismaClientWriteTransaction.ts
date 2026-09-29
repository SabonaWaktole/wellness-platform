import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { IClientWriteTransaction, ClientWriteRepos } from '../../application/ports/IClientWriteTransaction';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../../audit/infrastructure/PrismaAuditTrail';
import { PrismaClientRepository } from './PrismaClientRepository';

export class PrismaClientWriteTransaction implements IClientWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // client change back, as PrismaLookupWriteTransaction does.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: ClientWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ clients: new PrismaClientRepository(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
