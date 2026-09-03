import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import {
  ICustomFieldWriteTransaction,
  CustomFieldWriteRepos,
} from '../application/ports/ICustomFieldWriteTransaction';
import { PrismaCustomFieldDefinitionRepository } from './repositories/PrismaCustomFieldDefinitionRepository';
import { PrismaClientRepository } from './repositories/PrismaClientRepository';

export class PrismaCustomFieldWriteTransaction implements ICustomFieldWriteTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run<T>(work: (repos: CustomFieldWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * Repositories are constructed HERE, bound to `tx`, rather than
       * injected pre-built — see IQuotationWriteTransaction for why that
       * distinction is the whole point. `tx` is a Prisma.TransactionClient,
       * the same model delegates minus `$transaction`/`$connect`, neither of
       * which these repositories call.
       */
      const client = tx as unknown as PrismaClient;
      return work({
        customFieldRepo: new PrismaCustomFieldDefinitionRepository(client),
        clientRepo: new PrismaClientRepository(client),
      });
    });
  }
}
