import { IRoleAdminTransaction, IRoleWrites, RoleAdminRepos } from '../../src/access/application/ports/IRoleAdminTransaction';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export interface RoleAdminHarness {
  writeTx: IRoleAdminTransaction;
  roles: jest.Mocked<IRoleWrites>;
  auditTrail: jest.Mocked<IAuditTrail>;
  /** Every entry handed to auditTrail.record, in call order. */
  recordedAuditEntries: () => AuditEntry[];
}

/** The unit-test double for `IRoleAdminTransaction`: runs the work over mocked repositories. */
export function makeRoleAdminHarness(): RoleAdminHarness {
  const roles = {
    replaceGrants: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<IRoleWrites>;
  const auditTrail = { record: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<IAuditTrail>;

  const writeTx: IRoleAdminTransaction = {
    run: <T>(work: (repos: RoleAdminRepos) => Promise<T>): Promise<T> => work({ roles, auditTrail }),
  };

  return { writeTx, roles, auditTrail, recordedAuditEntries: () => auditTrail.record.mock.calls.map(([entry]) => entry) };
}

/** An `IPermissionsChanged` whose calls a test can assert on. */
export const makePermissionsChanged = () => ({ userChanged: jest.fn(), tenantChanged: jest.fn() });
