import {
  IQuotationWriteTransaction,
  QuotationWriteRepos,
} from '../../src/quotations/application/ports/IQuotationWriteTransaction';
import { IQuotationRepository } from '../../src/quotations/domain/IQuotationRepository';
import { IQuotationStatusHistoryRepository } from '../../src/quotations/domain/IQuotationStatusHistoryRepository';
import { INotificationRepository } from '../../src/notifications/domain/INotificationRepository';
import { IUserRepository } from '../../src/auth/domain/repositories/IUserRepository';

export interface QuotationWriteHarness {
  writeTx: IQuotationWriteTransaction;
  quotationRepo: jest.Mocked<IQuotationRepository>;
  historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;
  notificationRepo: jest.Mocked<INotificationRepository>;
  userRepo: jest.Mocked<IUserRepository>;
  /** Every notification handed to saveMany, flattened. */
  emitted: () => Array<{ type: string; recipientUserId: string; actorUserId: string | null }>;
}

/**
 * A write transaction that simply runs the work, handing over mocked
 * repositories.
 *
 * The real one wraps the callback in a Prisma interactive transaction. That is
 * an infrastructure guarantee and is verified against a real database in
 * `tests/integration/notifications/*`; at unit level the useful question is
 * "did the use case write the right things through the repositories it was
 * given", which this answers without a database.
 *
 * Shared rather than copied into six suites, because six hand-written copies of
 * the same double is exactly how the drift in TD-002 happened.
 */
export function makeQuotationWriteHarness(): QuotationWriteHarness {
  const quotationRepo = {
    findById: jest.fn(),
    findPendingApprovals: jest.fn(),
    search: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IQuotationRepository>;

  const historyRepo = {
    findByQuotationId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<IQuotationStatusHistoryRepository>;

  const notificationRepo = {
    saveMany: jest.fn().mockResolvedValue(undefined),
    findForRecipient: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    pruneForRecipient: jest.fn(),
  } as unknown as jest.Mocked<INotificationRepository>;

  const userRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAnyByEmail: jest.fn(),
    findSuperAdminByEmail: jest.fn(),
    findByTenantId: jest.fn(),
    findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    create: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn(),
    setActive: jest.fn(),
    softDelete: jest.fn(),
    countAssignedWork: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const writeTx: IQuotationWriteTransaction = {
    run: <T>(work: (repos: QuotationWriteRepos) => Promise<T>): Promise<T> =>
      work({ quotationRepo, historyRepo, notificationRepo }),
  };

  const emitted = () =>
    (notificationRepo.saveMany as jest.Mock).mock.calls.flatMap(
      ([batch]: [Array<{ type: string; recipientUserId: string; actorUserId: string | null }>]) => batch
    );

  return { writeTx, quotationRepo, historyRepo, notificationRepo, userRepo, emitted };
}
