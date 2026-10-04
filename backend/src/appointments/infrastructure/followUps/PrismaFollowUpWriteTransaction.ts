import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { PrismaDealWrites } from '../../../deals/infrastructure/PrismaDealWrites';
import { FollowUpWriteRepos, IFollowUpWriteTransaction } from '../../application/followUps/ports/IFollowUpWriteTransaction';
import { PrismaFollowUpWrites } from './PrismaFollowUpWrites';

export class PrismaFollowUpWriteTransaction implements IFollowUpWriteTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run<T>(work: (repos: FollowUpWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ followUps: new PrismaFollowUpWrites(client), deals: new PrismaDealWrites(client) });
    });
  }
}
