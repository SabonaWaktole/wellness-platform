import {
  IContractWriteTransaction,
  ContractWriteRepos,
} from '../../src/contracts/application/ports/IContractWriteTransaction';
import { IContractRepository } from '../../src/contracts/domain/IContractRepository';
import { IContractPaymentRepository } from '../../src/contracts/domain/IContractPaymentRepository';
import { IContractPaymentHistoryRepository } from '../../src/contracts/domain/IContractPaymentHistoryRepository';
import { IContractStatusHistoryRepository } from '../../src/contracts/domain/IContractStatusHistoryRepository';
import { IContractDocumentRepository } from '../../src/contracts/domain/IContractDocumentRepository';
import { IContractCompanyStatus } from '../../src/contracts/application/ports/IContractCompanyStatus';
import { IContractSettingsStore } from '../../src/contracts/application/ports/IContractSettingsStore';
import { IContractNumbers } from '../../src/contracts/application/ports/IContractNumbers';
import { IContractDealSource } from '../../src/contracts/application/ports/IContractDealSource';
import { IContractRenewals } from '../../src/contracts/application/ports/IContractRenewals';
import { IDealWrites } from '../../src/deals/application/ports/IDealWriteTransaction';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export interface ContractWriteHarness {
  writeTx: IContractWriteTransaction;
  contractRepo: jest.Mocked<IContractRepository>;
  paymentRepo: jest.Mocked<IContractPaymentRepository>;
  historyRepo: jest.Mocked<IContractStatusHistoryRepository>;
  paymentHistoryRepo: jest.Mocked<IContractPaymentHistoryRepository>;
  documentRepo: jest.Mocked<IContractDocumentRepository>;
  companyStatus: jest.Mocked<IContractCompanyStatus>;
  settingsStore: jest.Mocked<IContractSettingsStore>;
  numbers: jest.Mocked<IContractNumbers>;
  deals: jest.Mocked<IContractDealSource>;
  renewals: jest.Mocked<IContractRenewals>;
  dealWrites: jest.Mocked<IDealWrites>;
  auditTrail: jest.Mocked<IAuditTrail>;
  /** Every entry handed to auditTrail.record, in call order. */
  recordedAuditEntries: () => AuditEntry[];
}

/**
 * A contract write transaction that simply runs the work, handing over
 * mocked repositories — the unit-test double for `IContractWriteTransaction`,
 * modelled on `makeQuotationWriteHarness` (`fakeQuotationWriteTransaction.ts`)
 * for the same reason: one shared double instead of N hand-written copies.
 */
export function makeContractWriteHarness(): ContractWriteHarness {
  const contractRepo = {
    findById: jest.fn(),
    findByClientId: jest.fn().mockResolvedValue([]),
    findByDealId: jest.fn(),
    search: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractRepository>;

  const paymentRepo = {
    findById: jest.fn(),
    findByContractId: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    saveMany: jest.fn(),
    delete: jest.fn(),
    deleteNotInvoicedDueAfter: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<IContractPaymentRepository>;

  const historyRepo = {
    findByContractId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractStatusHistoryRepository>;

  const paymentHistoryRepo = {
    findByPaymentId: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractPaymentHistoryRepository>;

  const documentRepo = {
    findByContractId: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findCurrent: jest.fn().mockResolvedValue(null),
    addCurrent: jest.fn(),
  } as unknown as jest.Mocked<IContractDocumentRepository>;

  const companyStatus = {
    makeClient: jest.fn().mockResolvedValue(null),
    makeFormerClient: jest.fn().mockResolvedValue(null),
    hasOpenRenewalDeal: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<IContractCompanyStatus>;

  const settingsStore = {
    get: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractSettingsStore>;

  const numbers = { next: jest.fn().mockResolvedValue('CTR-2026-0001') } as unknown as jest.Mocked<IContractNumbers>;
  const deals = { find: jest.fn() } as unknown as jest.Mocked<IContractDealSource>;

  const renewals = {
    links: jest.fn().mockResolvedValue({ renewedFrom: null, renewedInto: null, openDealId: null }),
    lock: jest.fn().mockResolvedValue(true),
    isActiveUser: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<IContractRenewals>;
  const dealWrites = {
    insert: jest.fn(),
    recordChange: jest.fn(),
    companyName: jest.fn().mockResolvedValue('Acme'),
  } as unknown as jest.Mocked<IDealWrites>;

  const auditTrail = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IAuditTrail>;

  const writeTx: IContractWriteTransaction = {
    run: <T>(work: (repos: ContractWriteRepos) => Promise<T>): Promise<T> =>
      work({ contractRepo, paymentRepo, historyRepo, paymentHistoryRepo, documentRepo, companyStatus, settingsStore, numbers, deals, renewals, dealWrites, auditTrail }),
  };

  const recordedAuditEntries = () =>
    (auditTrail.record as jest.Mock).mock.calls.map(([entry]: [AuditEntry]) => entry);

  return { writeTx, contractRepo, paymentRepo, historyRepo, paymentHistoryRepo, documentRepo, companyStatus, settingsStore, numbers, deals, renewals, dealWrites, auditTrail, recordedAuditEntries };
}
