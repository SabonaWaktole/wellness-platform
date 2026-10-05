import {
  IContractWriteTransaction,
  ContractWriteRepos,
} from '../../src/contracts/application/ports/IContractWriteTransaction';
import { IContractRepository } from '../../src/contracts/domain/IContractRepository';
import { IContractPaymentRepository } from '../../src/contracts/domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../src/contracts/domain/IContractStatusHistoryRepository';
import { IContractSettingsStore } from '../../src/contracts/application/ports/IContractSettingsStore';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export interface ContractWriteHarness {
  writeTx: IContractWriteTransaction;
  contractRepo: jest.Mocked<IContractRepository>;
  paymentRepo: jest.Mocked<IContractPaymentRepository>;
  historyRepo: jest.Mocked<IContractStatusHistoryRepository>;
  settingsStore: jest.Mocked<IContractSettingsStore>;
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
    findByClientId: jest.fn(),
    search: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractRepository>;

  const paymentRepo = {
    findById: jest.fn(),
    findByContractId: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    saveMany: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IContractPaymentRepository>;

  const historyRepo = {
    findByContractId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractStatusHistoryRepository>;

  const settingsStore = {
    get: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IContractSettingsStore>;

  const auditTrail = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IAuditTrail>;

  const writeTx: IContractWriteTransaction = {
    run: <T>(work: (repos: ContractWriteRepos) => Promise<T>): Promise<T> =>
      work({ contractRepo, paymentRepo, historyRepo, settingsStore, auditTrail }),
  };

  const recordedAuditEntries = () =>
    (auditTrail.record as jest.Mock).mock.calls.map(([entry]: [AuditEntry]) => entry);

  return { writeTx, contractRepo, paymentRepo, historyRepo, settingsStore, auditTrail, recordedAuditEntries };
}
