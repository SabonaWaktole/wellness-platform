import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { IInteractionWriteTransaction, InteractionWriteRepos } from '../../application/ports/IInteractionWriteTransaction';
import { PrismaDealWrites } from '../../../deals/infrastructure/PrismaDealWrites';
import { PrismaInteractionRepository } from './PrismaInteractionRepository';
import { PrismaFollowUpWrites } from '../../../appointments/infrastructure/followUps/PrismaFollowUpWrites';

export class PrismaInteractionWriteTransaction implements IInteractionWriteTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run<T>(work: (repos: InteractionWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({
        interactions: new PrismaInteractionRepository(client),
        deals: new PrismaDealWrites(client),
        followUps: new PrismaFollowUpWrites(client),
      });
    });
  }
}
