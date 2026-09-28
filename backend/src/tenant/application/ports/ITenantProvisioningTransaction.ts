import { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { ISystemRoleSeeder } from '../../../access/application/ports/ISystemRoleSeeder';

/** The repositories provisioning a workspace writes through, all on one connection. */
export interface TenantProvisioningRepos {
  tenantRepo: ITenantRepository;
  userRepo: IUserRepository;
  roleSeeder: ISystemRoleSeeder;
}

/**
 * Creates a Tenant and its first BUSINESS_OWNER atomically.
 *
 * **The gap this closes was real, not theoretical.**
 * `RegisterBusinessOwnerUseCase` wrapped both writes in `IUnitOfWork` and read
 * as though that made them one unit. It did not: `PrismaUnitOfWork` opened a
 * `$transaction` and handed the work no client, while both repositories held
 * the global one at module scope — so the tenant autocommitted, then the user
 * autocommitted separately, and a failure in between left a **tenant with no
 * owner**: a workspace holding a unique `urlSlug` that nobody can sign into and
 * nobody can re-register. See TD-032.
 *
 * This port is modelled directly on `IQuotationWriteTransaction`, which fixed
 * the same class of bug for quotation status transitions. The mechanism is the
 * same one, for the same reason: it hands the caller repositories **bound to
 * the transaction**, so the guarantee is real rather than nominal.
 *
 * Proven by `tests/integration/tenant/tenantProvisioningAtomicity.test.ts`,
 * which forces a failure after the tenant write and asserts no tenant row
 * survives. That test fails against the old `PrismaUnitOfWork` arrangement,
 * which is the point of writing it.
 */
export interface ITenantProvisioningTransaction {
  run<T>(work: (repos: TenantProvisioningRepos) => Promise<T>): Promise<T>;
}
