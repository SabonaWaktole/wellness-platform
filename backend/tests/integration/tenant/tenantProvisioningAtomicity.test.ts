import { PrismaClient } from '@prisma/client';
import { PrismaTenantProvisioningTransaction } from '../../../src/tenant/infrastructure/PrismaTenantProvisioningTransaction';
import { ITenantProvisioningTransaction } from '../../../src/tenant/application/ports/ITenantProvisioningTransaction';
import { PrismaTenantRepository } from '../../../src/tenant/infrastructure/repositories/PrismaTenantRepository';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaSystemRoleSeeder } from '../../../src/access/infrastructure/PrismaSystemRoleSeeder';
import { CreateTenantWithOwnerUseCase } from '../../../src/tenant/application/use-cases/CreateTenantWithOwnerUseCase';
import { IPasswordHasher } from '../../../src/auth/application/ports/IPasswordHasher';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { SlugAlreadyTakenError } from '../../../src/auth/domain/errors';

/**
 * Provisioning atomicity, against a real database.
 *
 * This is the test TD-032 asked for, in the form TD-032's own fix established:
 * force a failure mid-operation and assert that nothing landed.
 *
 * It matters because the previous arrangement — `RegisterBusinessOwnerUseCase`
 * wrapped in `PrismaUnitOfWork` — looked exactly like this one and provided
 * none of the guarantee. That wrapper opened a `$transaction` and handed the
 * work no client, while both repositories held the global client at module
 * scope, so the tenant write autocommitted on its own connection. A failure
 * before the user write therefore left a **tenant with no owner**: a workspace
 * squatting a unique urlSlug that nobody could sign into and nobody could
 * re-register.
 *
 * The rollback case below fails against that arrangement and passes against
 * this one. That difference is the entire point of the file.
 */
describe('Tenant provisioning atomicity', () => {
  let prisma: PrismaClient;
  const slugs: string[] = [];

  /** Real enough to be indistinguishable to the use case, fast enough for a suite. */
  const passwordHasher: IPasswordHasher = {
    hash: async (plain: string) => `hashed:${plain}`,
    compare: async (plain: string, hashed: string) => hashed === `hashed:${plain}`,
  };

  const validInput = (slug: string) => ({
    companyName: `Company ${slug}`,
    urlSlug: slug,
    ownerEmail: `owner-${slug}@example.com`,
    ownerPassword: 'StrongPassword123',
  });

  const track = (slug: string) => {
    slugs.push(slug);
    return slug;
  };

  /**
   * Replace one method on a repository the transaction handed out, keeping the
   * rest intact.
   *
   * `Object.create(repo)` rather than `{ ...repo }`: these repositories are
   * class instances, so their methods live on the prototype and a spread copies
   * only the own properties — producing an object that still holds the Prisma
   * client but has no `create` to call.
   */
  const withOverrides = <T extends object>(repo: T, overrides: Partial<T>): T =>
    Object.assign(Object.create(repo), overrides);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    const tenants = await prisma.tenant.findMany({
      where: { urlSlug: { in: slugs } },
      select: { id: true },
    });
    const ids = tenants.map((t) => t.id);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it('commits the tenant and its owner together', async () => {
    const slug = track(`atomic-ok-${Date.now()}`);
    const useCase = new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(prisma),
      passwordHasher
    );

    const { tenant, user } = await useCase.execute(validInput(slug));

    const persistedTenant = await prisma.tenant.findUnique({ where: { urlSlug: slug } });
    const persistedUsers = await prisma.user.findMany({ where: { tenantId: tenant.id } });

    expect(persistedTenant).not.toBeNull();
    expect(persistedTenant!.subscriptionStatus).toBe('ACTIVE');
    expect(persistedUsers).toHaveLength(1);
    expect(persistedUsers[0].id).toBe(user.id);
    expect(persistedUsers[0].role).toBe(UserRole.BUSINESS_OWNER);
    expect(persistedUsers[0].tenantId).toBe(tenant.id);
  });

  it('FR-RBAC-01 gives the new workspace its five system roles and makes the owner its Administrator', async () => {
    const slug = track(`atomic-roles-${Date.now()}`);
    const useCase = new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(prisma),
      passwordHasher
    );

    const { tenant, user } = await useCase.execute(validInput(slug));

    const roles = await prisma.role.findMany({ where: { tenantId: tenant.id }, include: { permissions: true } });
    expect(roles.map((r) => r.key).sort()).toEqual(['ADMINISTRATOR', 'CEO', 'RECEPTION', 'SALES_MANAGER', 'SALES_USER']);
    const administrator = roles.find((r) => r.key === 'ADMINISTRATOR')!;
    expect(administrator.permissions.map((p) => p.permissionKey)).toContain('users.manage');

    const owner = await prisma.user.findUnique({ where: { id: user.id } });
    expect(owner!.roleId).toBe(administrator.id);
  });

  it('leaves NO tenant behind when the owner write fails — proving the transaction is real', async () => {
    const slug = track(`atomic-rollback-${Date.now()}`);

    /*
     * The failure is injected at the last possible moment: the tenant has
     * already been written inside the transaction when this throws. Under the
     * old PrismaUnitOfWork arrangement that write had already autocommitted on
     * a different connection, so the tenant would survive and this assertion
     * would fail.
     */
    const explodingTx = new PrismaTenantProvisioningTransaction(prisma);
    const originalRun = explodingTx.run.bind(explodingTx);
    explodingTx.run = (work) =>
      originalRun(async (repos) =>
        work({
          ...repos,
          userRepo: withOverrides(repos.userRepo, {
            create: async () => {
              throw new Error('owner write failed');
            },
          }),
        })
      );

    const useCase = new CreateTenantWithOwnerUseCase(explodingTx, passwordHasher);

    await expect(useCase.execute(validInput(slug))).rejects.toThrow('owner write failed');

    const orphan = await prisma.tenant.findUnique({ where: { urlSlug: slug } });
    expect(orphan).toBeNull();
  });

  it('the old PrismaUnitOfWork arrangement DOES leave an orphan — the control for the test above', async () => {
    /*
     * A test that never fails proves nothing, so this reconstructs the exact
     * shape that shipped before: a `$transaction` wrapping repositories bound
     * to the GLOBAL client instead of to `tx`. That is precisely what
     * `PrismaUnitOfWork` did.
     *
     * The class itself is deleted, so this builds the arrangement by hand
     * rather than importing it. If this ever stops leaving an orphan, the
     * rollback test above has stopped discriminating and someone should find
     * out why before trusting it.
     */
    const slug = track(`atomic-control-${Date.now()}`);

    const looksAtomicButIsNot: ITenantProvisioningTransaction = {
      run: (work) =>
        prisma.$transaction(async () =>
          // Note what is NOT passed to these constructors: `tx`. They default
          // to the global client, exactly as the module-scope imports did.
          work({
            tenantRepo: new PrismaTenantRepository(),
            userRepo: new PrismaUserRepository(),
            roleSeeder: new PrismaSystemRoleSeeder(prisma),
            lookupSeeder: new PrismaLookupSeeder(prisma),
          })
        ),
    };

    const originalRun = looksAtomicButIsNot.run.bind(looksAtomicButIsNot);
    looksAtomicButIsNot.run = (work) =>
      originalRun(async (repos) =>
        work({
          ...repos,
          userRepo: withOverrides(repos.userRepo, {
            create: async () => {
              throw new Error('owner write failed');
            },
          }),
        })
      );

    await expect(
      new CreateTenantWithOwnerUseCase(looksAtomicButIsNot, passwordHasher).execute(
        validInput(slug)
      )
    ).rejects.toThrow('owner write failed');

    // The tenant survived the "rollback". This is the bug, reproduced.
    const orphan = await prisma.tenant.findUnique({ where: { urlSlug: slug } });
    expect(orphan).not.toBeNull();

    const owners = await prisma.user.count({ where: { tenantId: orphan!.id } });
    expect(owners).toBe(0);
  });

  it('frees the slug after a rolled-back attempt, so the same business can retry', async () => {
    /*
     * The user-visible consequence of the bug, stated as a test. An orphan
     * tenant holds its unique slug forever; a business whose registration
     * failed halfway could never sign up again under the name it chose, and no
     * error would explain why.
     */
    const slug = track(`atomic-retry-${Date.now()}`);

    const failingTx = new PrismaTenantProvisioningTransaction(prisma);
    const originalRun = failingTx.run.bind(failingTx);
    failingTx.run = (work) =>
      originalRun(async (repos) =>
        work({
          ...repos,
          userRepo: withOverrides(repos.userRepo, {
            create: async () => {
              throw new Error('transient failure');
            },
          }),
        })
      );

    await expect(
      new CreateTenantWithOwnerUseCase(failingTx, passwordHasher).execute(validInput(slug))
    ).rejects.toThrow('transient failure');

    // The retry succeeds precisely because the failed attempt left nothing.
    const { tenant } = await new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(prisma),
      passwordHasher
    ).execute(validInput(slug));

    expect(tenant.urlSlug).toBe(slug);
    const persisted = await prisma.tenant.findUnique({ where: { urlSlug: slug } });
    expect(persisted).not.toBeNull();
  });

  it('refuses a slug that is already taken, writing nothing', async () => {
    const slug = track(`atomic-dup-${Date.now()}`);
    const useCase = new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(prisma),
      passwordHasher
    );

    await useCase.execute(validInput(slug));
    const usersAfterFirst = await prisma.user.count({
      where: { tenant: { urlSlug: slug } },
    });

    await expect(useCase.execute(validInput(slug))).rejects.toThrow(SlugAlreadyTakenError);

    // The second attempt added no second owner to the existing workspace.
    const usersAfterSecond = await prisma.user.count({
      where: { tenant: { urlSlug: slug } },
    });
    expect(usersAfterSecond).toBe(usersAfterFirst);
  });

  it('surfaces a lost unique-constraint race as SlugAlreadyTakenError, not a raw Prisma error', async () => {
    /*
     * The in-transaction slug check can still lose a race under READ COMMITTED;
     * the unique index is the real guarantee. Simulated here by skipping the
     * check, which is what losing the race amounts to: the caller must get the
     * domain error either way rather than an opaque P2002.
     */
    const slug = track(`atomic-race-${Date.now()}`);
    const useCase = new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(prisma),
      passwordHasher
    );
    await useCase.execute(validInput(slug));

    const blindTx = new PrismaTenantProvisioningTransaction(prisma);
    const originalRun = blindTx.run.bind(blindTx);
    blindTx.run = (work) =>
      originalRun(async (repos) =>
        work({
          ...repos,
          tenantRepo: withOverrides(repos.tenantRepo, {
            findBySlug: async () => null,
          }),
        })
      );

    await expect(
      new CreateTenantWithOwnerUseCase(blindTx, passwordHasher).execute(validInput(slug))
    ).rejects.toThrow(SlugAlreadyTakenError);
  });
});
