import {
  IAssignmentTransfer,
  IStaffWrites,
  IUserAdminTransaction,
  UserAdminRepos,
} from '../../src/auth/application/ports/IUserAdminTransaction';
import { IInvitationRepository } from '../../src/auth/domain/repositories/IInvitationRepository';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export interface UserAdminHarness {
  writeTx: IUserAdminTransaction;
  staff: jest.Mocked<IStaffWrites>;
  invitations: jest.Mocked<IInvitationRepository>;
  assignments: jest.Mocked<IAssignmentTransfer>;
  auditTrail: jest.Mocked<IAuditTrail>;
  /** Every entry handed to auditTrail.record, in call order. */
  recordedAuditEntries: () => AuditEntry[];
}

/** The unit-test double for `IUserAdminTransaction`: runs the work over mocked repositories. */
export function makeUserAdminHarness(): UserAdminHarness {
  const staff = {
    create: jest.fn().mockResolvedValue(undefined),
    setRole: jest.fn().mockResolvedValue(undefined),
    setActive: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IStaffWrites>;

  const invitations = {
    create: jest.fn().mockImplementation(async (invitation) => invitation),
    findByToken: jest.fn(),
    findByTenantId: jest.fn(),
    markAccepted: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn(),
  } as unknown as jest.Mocked<IInvitationRepository>;

  const assignments = {
    reassignCompanies: jest.fn().mockResolvedValue([]),
    reassignOpenContracts: jest.fn().mockResolvedValue([]),
  } as jest.Mocked<IAssignmentTransfer>;

  const auditTrail = { record: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<IAuditTrail>;

  const writeTx: IUserAdminTransaction = {
    run: <T>(work: (repos: UserAdminRepos) => Promise<T>): Promise<T> =>
      work({ staff, invitations, assignments, auditTrail }),
  };

  return {
    writeTx,
    staff,
    invitations,
    assignments,
    auditTrail,
    recordedAuditEntries: () => auditTrail.record.mock.calls.map(([entry]) => entry),
  };
}
