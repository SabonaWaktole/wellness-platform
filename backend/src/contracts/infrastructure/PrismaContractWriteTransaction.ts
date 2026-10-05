import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import {
  IContractWriteTransaction,
  ContractWriteRepos,
} from '../application/ports/IContractWriteTransaction';
import { PrismaContractRepository } from './repositories/PrismaContractRepository';
import { PrismaContractPaymentRepository } from './repositories/PrismaContractPaymentRepository';
import { PrismaContractPaymentHistoryRepository } from './repositories/PrismaContractPaymentHistoryRepository';
import { PrismaContractStatusHistoryRepository } from './repositories/PrismaContractStatusHistoryRepository';
import { PrismaContractDocumentRepository } from './repositories/PrismaContractDocumentRepository';
import { PrismaContractCompanyStatus } from './PrismaContractCompanyStatus';
import { PrismaContractSettingsStore } from './PrismaContractSettingsStore';
import { PrismaContractNumbers } from './PrismaContractNumbers';
import { PrismaContractDealSource } from './PrismaContractDealSource';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';

export class PrismaContractWriteTransaction implements IContractWriteTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can hand back an IAuditTrail that throws,
    // to prove a failed audit write rolls back the whole transaction
    // (FR-AUD-04). Every real caller uses the default, a PrismaAuditTrail on
    // this same `tx`.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) =>
      new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: ContractWriteRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Same narrow, deliberate cast as PrismaInvoiceWriteTransaction — `tx`
      // is a Prisma.TransactionClient, missing only `$transaction`/`$connect`,
      // neither of which these repositories call.
      const client = tx as unknown as PrismaClient;
      return work({
        contractRepo: new PrismaContractRepository(client),
        paymentRepo: new PrismaContractPaymentRepository(client),
        historyRepo: new PrismaContractStatusHistoryRepository(client),
        paymentHistoryRepo: new PrismaContractPaymentHistoryRepository(client),
        documentRepo: new PrismaContractDocumentRepository(client),
        companyStatus: new PrismaContractCompanyStatus(client),
        settingsStore: new PrismaContractSettingsStore(client),
        numbers: new PrismaContractNumbers(client),
        deals: new PrismaContractDealSource(client),
        auditTrail: this.auditTrailFor(client),
      });
    });
  }
}
