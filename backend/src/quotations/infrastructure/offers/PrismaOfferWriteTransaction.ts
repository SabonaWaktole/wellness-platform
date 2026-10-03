import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { PrismaAuditTrail } from '../../../audit/infrastructure/PrismaAuditTrail';
import { PrismaDealWrites } from '../../../deals/infrastructure/PrismaDealWrites';
import { IOfferWriteTransaction, OfferWriteRepos } from '../../application/offers/ports/IOfferWriteTransaction';
import { PrismaOfferWrites } from './PrismaOfferWrites';

export class PrismaOfferWriteTransaction implements IOfferWriteTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run<T>(work: (repos: OfferWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ offers: new PrismaOfferWrites(client), deals: new PrismaDealWrites(client), auditTrail: new PrismaAuditTrail(client) });
    });
  }
}
