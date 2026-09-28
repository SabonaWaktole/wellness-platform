import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import { PrismaTenantRepository } from '../../tenant/infrastructure/repositories/PrismaTenantRepository';
import { ISettingsWriteTransaction, SettingsWriteRepos } from '../application/ports/ISettingsWriteTransaction';
import { TenantProfileStore } from './TenantProfileStore';

export class PrismaSettingsWriteTransaction implements ISettingsWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // settings change back (FR-AUD-04), as in PrismaLookupWriteTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: SettingsWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({
        tenantRepository: new PrismaTenantRepository(client),
        profileStore: new TenantProfileStore(client),
        auditTrail: this.auditTrailFor(client),
      });
    });
  }
}
