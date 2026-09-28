import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import {
  ITenantProvisioningTransaction,
  TenantProvisioningRepos,
} from '../application/ports/ITenantProvisioningTransaction';
import { PrismaTenantRepository } from './repositories/PrismaTenantRepository';
import { PrismaUserRepository } from '../../auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaSystemRoleSeeder } from '../../access/infrastructure/PrismaSystemRoleSeeder';

export class PrismaTenantProvisioningTransaction implements ITenantProvisioningTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run<T>(work: (repos: TenantProvisioningRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * The repositories are constructed HERE, bound to `tx`, rather than
       * injected. That is the whole difference between this and
       * `PrismaUnitOfWork`: repositories built against the global client would
       * run outside the transaction no matter what wrapper surrounded them.
       *
       * `tx` is a Prisma.TransactionClient — the same model delegates minus
       * `$transaction` and `$connect`, neither of which these repositories
       * call. The cast is narrow and deliberate.
       */
      const client = tx as unknown as PrismaClient;
      return work({
        tenantRepo: new PrismaTenantRepository(client),
        userRepo: new PrismaUserRepository(client),
        roleSeeder: new PrismaSystemRoleSeeder(client),
      });
    });
  }
}
