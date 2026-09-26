import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import {
  IContractWriteTransaction,
  ContractWriteRepos,
} from '../application/ports/IContractWriteTransaction';
import { PrismaContractRepository } from './repositories/PrismaContractRepository';
import { PrismaContractPaymentRepository } from './repositories/PrismaContractPaymentRepository';
import { PrismaContractStatusHistoryRepository } from './repositories/PrismaContractStatusHistoryRepository';

export class PrismaContractWriteTransaction implements IContractWriteTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

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
      });
    });
  }
}
