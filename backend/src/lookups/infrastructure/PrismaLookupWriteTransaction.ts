import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ILookupWriteTransaction, ILookupWrites, LookupWriteRepos } from '../application/ports/ILookupWriteTransaction';
import { LookupList } from '../domain/LookupList';
import { LookupRecord } from '../domain/LookupItem';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import { lookupDelegate, rowFor } from './prismaLookupTables';

class PrismaLookupWrites implements ILookupWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async create(tenantId: string, list: LookupList, item: LookupRecord): Promise<void> {
    await lookupDelegate(this.prisma, list).create({ data: { ...rowFor(list, item), tenantId } });
  }

  async update(tenantId: string, list: LookupList, item: LookupRecord): Promise<void> {
    const { id, ...fields } = rowFor(list, item);
    await lookupDelegate(this.prisma, list).updateMany({ where: { id, tenantId }, data: fields });
  }

  async delete(tenantId: string, list: LookupList, id: string): Promise<void> {
    await lookupDelegate(this.prisma, list).deleteMany({ where: { id, tenantId } });
  }
}

export class PrismaLookupWriteTransaction implements ILookupWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // list change back (FR-AUD-04), as in PrismaRoleAdminTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: LookupWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ lookups: new PrismaLookupWrites(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
