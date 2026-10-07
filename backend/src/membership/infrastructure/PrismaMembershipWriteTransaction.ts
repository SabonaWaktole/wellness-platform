import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';
import type { IMembershipWriteTransaction, MembershipWriteRepos } from '../application/ports/IMembershipWriteTransaction';
import { PrismaBenefitStore } from './PrismaBenefitStore';
import { PrismaMemberNumbers } from './PrismaMemberNumbers';
import { PrismaMemberPaymentStore } from './PrismaMemberPaymentStore';
import { PrismaReceiptNumbers } from './PrismaReceiptNumbers';
import { PrismaMemberStore } from './PrismaMemberStore';
import { PrismaMembershipSettingsStore } from './PrismaMembershipSettingsStore';
import { PrismaRelationshipStore } from './PrismaRelationshipStore';

export class PrismaMembershipWriteTransaction implements IMembershipWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the change back (FR-AUD-14).
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: MembershipWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({
        settingsStore: new PrismaMembershipSettingsStore(client),
        relationshipStore: new PrismaRelationshipStore(client),
        benefitStore: new PrismaBenefitStore(client),
        memberStore: new PrismaMemberStore(client),
        memberNumbers: new PrismaMemberNumbers(client),
        paymentStore: new PrismaMemberPaymentStore(client),
        receiptNumbers: new PrismaReceiptNumbers(client),
        auditTrail: this.auditTrailFor(client),
      });
    });
  }
}
