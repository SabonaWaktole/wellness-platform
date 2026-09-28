import {
  ITenantProvisioningTransaction,
  TenantProvisioningRepos,
} from '../../src/tenant/application/ports/ITenantProvisioningTransaction';
import { ITenantRepository } from '../../src/tenant/domain/repositories/ITenantRepository';
import { IUserRepository } from '../../src/auth/domain/repositories/IUserRepository';
import { ISystemRoleSeeder } from '../../src/access/application/ports/ISystemRoleSeeder';
import { RoleKey } from '../../src/access/domain/RoleKey';

export interface TenantProvisioningHarness {
  provisioningTx: ITenantProvisioningTransaction;
  tenantRepo: jest.Mocked<ITenantRepository>;
  userRepo: jest.Mocked<IUserRepository>;
  roleSeeder: jest.Mocked<ISystemRoleSeeder>;
}

/**
 * A provisioning transaction that simply runs the work, handing over mocked
 * repositories.
 *
 * The real one wraps the callback in a Prisma interactive transaction. That is
 * an infrastructure guarantee and is verified against a real database in
 * `tests/integration/tenant/tenantProvisioningAtomicity.test.ts`; at unit level
 * the useful question is "did the use case write the right things through the
 * repositories it was given", which this answers without a database.
 *
 * Shared rather than copied into each suite, following
 * `fakeQuotationWriteTransaction` â€” hand-written copies of the same double are
 * exactly how the drift in TD-002 happened.
 */
export function makeTenantProvisioningHarness(): TenantProvisioningHarness {
  const tenantRepo = {
    findById: jest.fn(),
    findBySlug: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (tenant) => tenant),
    findAll: jest.fn(),
    updateSettings: jest.fn(),
    updateSettingsForMany: jest.fn(),
    setSubscriptionStatus: jest.fn(),
  } as unknown as jest.Mocked<ITenantRepository>;

  const userRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAnyByEmail: jest.fn(),
    findSuperAdminByEmail: jest.fn(),
    findByTenantId: jest.fn(),
    findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockImplementation(async (user) => user),
    updatePassword: jest.fn(),
    updateProfile: jest.fn(),
    setActive: jest.fn(),
    softDelete: jest.fn(),
    countAssignedWork: jest.fn(),
  } as unknown as jest.Mocked<IUserRepository>;

  const roleSeeder = {
    seed: jest.fn().mockResolvedValue(
      Object.fromEntries(Object.values(RoleKey).map((key) => [key, `role-${key}`])) as Record<RoleKey, string>
    ),
  } as jest.Mocked<ISystemRoleSeeder>;

  const provisioningTx: ITenantProvisioningTransaction = {
    run: <T>(work: (repos: TenantProvisioningRepos) => Promise<T>): Promise<T> =>
      work({ tenantRepo, userRepo, roleSeeder }),
  };

  return { provisioningTx, tenantRepo, userRepo, roleSeeder };
}
