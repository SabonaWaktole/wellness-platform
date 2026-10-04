import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../../audit/infrastructure/PrismaAuditTrail';
import { PrismaDealWrites } from '../../../deals/infrastructure/PrismaDealWrites';
import { PrismaDiscountApprovalWrites } from '../../../discounts/infrastructure/PrismaDiscountApprovalWrites';
import { PrismaNotificationRepository } from '../../../notifications/infrastructure/PrismaNotificationRepository';
import { IOfferWriteTransaction, OfferWriteRepos } from '../../application/offers/ports/IOfferWriteTransaction';
import { PrismaOfferNumbers } from './PrismaOfferNumbers';
import { PrismaOfferWrites } from './PrismaOfferWrites';

export class PrismaOfferWriteTransaction implements IOfferWriteTransaction {
  /**
   * `auditTrailFor` lets a test make the audit write fail, to prove the
   * offer's change rolls back with it (FR-AUD-09).
   */
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: OfferWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({
        offers: new PrismaOfferWrites(client),
        numbers: new PrismaOfferNumbers(client),
        deals: new PrismaDealWrites(client),
        auditTrail: this.auditTrailFor(client),
        approvals: new PrismaDiscountApprovalWrites(client),
        notifications: new PrismaNotificationRepository(client),
      });
    });
  }
}
