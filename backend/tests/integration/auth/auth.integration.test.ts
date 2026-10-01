import request from 'supertest';
import { cookieJwt, jwtCookieLine } from '../../support/cookieJwt';
import express from 'express';
import { createApp, AppDependencies } from '@main/app';
import {
  AssignedWork,
  IUserRepository,
  PlatformUserFilters,
  PlatformUserRow,
} from '@auth/domain/repositories/IUserRepository';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { IInvitationRepository } from '@auth/domain/repositories/IInvitationRepository';
import { IPasswordResetTokenRepository } from '@auth/domain/repositories/IPasswordResetTokenRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { ITokenService, TokenPayload } from '@auth/application/ports/ITokenService';
import { IEmailSender } from '@auth/application/ports/IEmailSender';
import {
  ITenantProvisioningTransaction,
  TenantProvisioningRepos,
} from '@tenant/application/ports/ITenantProvisioningTransaction';
import { SubscriptionStatus } from '@tenant/domain/enums/SubscriptionStatus';
import { User } from '@auth/domain/entities/User';
import { Tenant } from '@tenant/domain/entities/Tenant';
import { Invitation } from '@auth/domain/entities/Invitation';
import { PasswordResetToken } from '@auth/domain/entities/PasswordResetToken';
import { UserRole } from '@auth/domain/enums/UserRole';
import { IAccessRepository, AccessRecord } from '../../../src/access/application/ports/IAccessRepository';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../../src/access/domain/RoleKey';
import { IRoleCatalogue, RoleSummary, RoleUsage } from '../../../src/access/application/ports/IRoleCatalogue';
import { DEFAULT_ROLE_MATRIX } from '../../../src/access/domain/DefaultRoleMatrix';
import { legacyRoleKeyFor } from '../../../src/access/domain/LegacyRoleMapping';
import { IUserAdminTransaction, UserAdminRepos } from '../../../src/auth/application/ports/IUserAdminTransaction';
import { AuditEntry } from '../../../src/audit/domain/AuditEntry';

// ---------------------------------------------------------------------------
// In-memory implementations of ports â€” lightweight fakes that behave like
// real repositories but keep state in plain arrays, removing the need for
// a running database.
// ---------------------------------------------------------------------------

class InMemoryUserRepository implements IUserRepository {
  private users: User[] = [];

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) ?? null;
  }
  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    return this.users.find(u => u.email === email && u.tenantId === tenantId) ?? null;
  }
  async findAnyByEmail(email: string): Promise<User | null> {
    return this.users.find(u => u.email === email) ?? null;
  }
  async findByTenantId(tenantId: string): Promise<User[]> {
    return this.users.filter(u => u.tenantId === tenantId);
  }
  async findActiveByTenantAndRole(tenantId: string, role: string): Promise<User[]> {
    // Mirrors the Prisma implementation, including the isActive filter that
    // keeps deactivated members out of notification fan-out (TD-010).
    return this.users.filter(u => u.tenantId === tenantId && u.role === role && u.isActive);
  }
  async findSuperAdminByEmail(email: string): Promise<User | null> {
    return this.users.find(u => u.email === email && u.role === UserRole.SUPER_ADMIN) ?? null;
  }
  async countActivePlatformAdmins(): Promise<number> {
    // Mirrors the Prisma implementation's filters: an admin who is suspended or
    // soft-deleted cannot sign in, so neither counts as "someone is left".
    return this.users.filter(
      u => u.role === UserRole.SUPER_ADMIN && u.isActive && !u.deletedAt
    ).length;
  }
  async findPlatformUsers(filters: PlatformUserFilters): Promise<{ items: PlatformUserRow[]; total: number }> {
    // The platform console's cross-workspace listing. `tenantName` is null here
    // because this fake holds no tenants; the tests that exercise this endpoint
    // assert on membership and filtering, not on the joined name.
    const matched = this.users.filter(u =>
      (filters.tenantId === undefined || u.tenantId === filters.tenantId) &&
      (filters.role === undefined || u.role === filters.role) &&
      (filters.isActive === undefined || u.isActive === filters.isActive) &&
      (filters.q === undefined || u.email.toLowerCase().includes(filters.q.toLowerCase()))
    );
    const page = matched.slice(filters.skip ?? 0, (filters.skip ?? 0) + (filters.take ?? matched.length));
    return {
      items: page.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        tenantId: u.tenantId,
        tenantName: null,
        createdAt: u.createdAt,
        pendingOwnershipTransfer: null,
      })),
      total: matched.length,
    };
  }
  async create(user: User): Promise<User> {
    this.users.push(user);
    return user;
  }
  async delete(id: string): Promise<void> {
    this.users = this.users.filter(u => u.id !== id);
  }
  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      // Reconstruct with new password (immutable entity pattern)
      const idx = this.users.indexOf(user);
      this.users[idx] = User.create({
        id: user.id,
        email: user.email,
        hashedPassword,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
      });
    }
  }

  async updateProfile(userId: string, data: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string }): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      const idx = this.users.indexOf(user);
      this.users[idx] = User.create({
        id: user.id,
        email: data.email ?? user.email,
        hashedPassword: user.hashedPassword,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        firstName: data.firstName !== undefined ? data.firstName : user.firstName,
        lastName: data.lastName !== undefined ? data.lastName : user.lastName,
        phone: data.phone !== undefined ? data.phone : user.phone,
      });
    }
  }
  /** Not on IUserRepository: role writes go through IUserAdminTransaction (see InMemoryUserAdminTransaction). */
  async setRole(userId: string, roleId: string, role: string, warehouseId: string | null): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      const idx = this.users.indexOf(user);
      this.users[idx] = User.create({
        id: user.id,
        email: user.email,
        hashedPassword: user.hashedPassword,
        role: role as UserRole,
        roleId,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        warehouseId,
      });
    }
  }

  async setActive(userId: string, isActive: boolean): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      const idx = this.users.indexOf(user);
      this.users[idx] = User.create({
        id: user.id,
        email: user.email,
        hashedPassword: user.hashedPassword,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        warehouseId: user.warehouseId,
        isActive,
      });
    }
  }

  async countAssignedWork(_userId: string): Promise<AssignedWork> {
    // This double holds no clients, contracts or appointments, so there is nothing to count.
    return { clients: 0, upcomingAppointments: 0, openContracts: 0, companies: [] };
  }

  async softDelete(userId: string): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      const idx = this.users.indexOf(user);
      this.users[idx] = User.create({
        id: user.id,
        email: `deleted-${user.id}@deleted.invalid`,
        hashedPassword: user.hashedPassword,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        firstName: null,
        lastName: null,
        phone: null,
        warehouseId: user.warehouseId,
        isActive: false,
      });
    }
  }

  // Test helper
  getAll(): User[] { return [...this.users]; }
  clear(): void { this.users = []; }
}

class InMemoryTenantRepository implements ITenantRepository {
  private tenants: Tenant[] = [];

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.find(t => t.id === id) ?? null;
  }
  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenants.find(t => t.urlSlug === slug) ?? null;
  }
  async create(tenant: Tenant): Promise<Tenant> {
    this.tenants.push(tenant);
    return tenant;
  }
  async findAll(skip: number, take: number): Promise<{ items: Tenant[]; total: number }> {
    return { items: this.tenants.slice(skip, skip + take), total: this.tenants.length };
  }
  async updateSettings(id: string, settings: { requiresQuotationApproval: boolean }): Promise<void> {
    const tenant = this.tenants.find(t => t.id === id);
    if (tenant) {
      const idx = this.tenants.indexOf(tenant);
      this.tenants[idx] = Tenant.create({
        id: tenant.id,
        name: tenant.name,
        urlSlug: tenant.urlSlug,
        requiresQuotationApproval: settings.requiresQuotationApproval,
        createdAt: tenant.createdAt,
      });
    }
  }

  async updateSettingsForMany(
    tenantIds: string[],
    settings: { requiresQuotationApproval?: boolean }
  ): Promise<number> {
    let count = 0;
    for (const id of tenantIds) {
      const tenant = this.tenants.find((t) => t.id === id);
      if (!tenant) continue;
      const idx = this.tenants.indexOf(tenant);
      this.tenants[idx] = Tenant.create({
        id: tenant.id,
        name: tenant.name,
        urlSlug: tenant.urlSlug,
        requiresQuotationApproval: settings.requiresQuotationApproval ?? tenant.requiresQuotationApproval,
        createdAt: tenant.createdAt,
      });
      count++;
    }
    return count;
  }

  async setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<void> {
    const tenant = this.tenants.find(t => t.id === id);
    if (tenant) {
      const idx = this.tenants.indexOf(tenant);
      this.tenants[idx] = Tenant.create({
        id: tenant.id,
        name: tenant.name,
        urlSlug: tenant.urlSlug,
        requiresQuotationApproval: tenant.requiresQuotationApproval,
        subscriptionStatus: status,
        createdAt: tenant.createdAt,
      });
    }
  }

  getAll(): Tenant[] { return [...this.tenants]; }
  clear(): void { this.tenants = []; }
}

class InMemoryInvitationRepository implements IInvitationRepository {
  private invitations: Invitation[] = [];

  async create(invitation: Invitation): Promise<Invitation> {
    this.invitations.push(invitation);
    return invitation;
  }
  async findByToken(token: string): Promise<Invitation | null> {
    return this.invitations.find(i => i.token === token) ?? null;
  }
  async findByTenantId(tenantId: string): Promise<Invitation[]> {
    return this.invitations.filter(i => i.tenantId === tenantId);
  }
  async markAccepted(id: string, acceptedAt: Date): Promise<void> {
    const idx = this.invitations.findIndex(i => i.id === id);
    if (idx >= 0) {
      const inv = this.invitations[idx];
      this.invitations[idx] = Invitation.create({
        id: inv.id,
        tenantId: inv.tenantId,
        email: inv.email,
        role: inv.role,
        token: inv.token,
        expiresAt: inv.expiresAt,
        acceptedAt,
      });
    }
  }

  async delete(id: string): Promise<void> {
    this.invitations = this.invitations.filter(i => i.id !== id);
  }

  getAll(): Invitation[] { return [...this.invitations]; }
  clear(): void { this.invitations = []; }
}

class InMemoryPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  private tokens: PasswordResetToken[] = [];

  async create(token: PasswordResetToken): Promise<PasswordResetToken> {
    this.tokens.push(token);
    return token;
  }
  async findByToken(token: string): Promise<PasswordResetToken | null> {
    return this.tokens.find(t => t.token === token) ?? null;
  }
  async markUsed(id: string, usedAt: Date): Promise<void> {
    const idx = this.tokens.findIndex(t => t.id === id);
    if (idx >= 0) {
      const prt = this.tokens[idx];
      this.tokens[idx] = PasswordResetToken.create({
        id: prt.id,
        userId: prt.userId,
        token: prt.token,
        expiresAt: prt.expiresAt,
        usedAt,
      });
    }
  }

  getAll(): PasswordResetToken[] { return [...this.tokens]; }
  clear(): void { this.tokens = []; }
}

/** Plain hasher that uses a deterministic prefix so we can verify without bcrypt overhead. */
class FakePasswordHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }
  async compare(plain: string, hashed: string): Promise<boolean> {
    return hashed === `hashed:${plain}`;
  }
}

/** Minimal JWT-like token service using base64 encoding for speed. */
// Deliberately skips signature verification, purely to test authorization/business logic in isolation.
class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: TokenPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): TokenPayload {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch {
      throw new Error('Invalid token');
    }
  }
}

class FakeEmailSender implements IEmailSender {
  public sentEmails: Array<{ to: string; type: string; token: string; tenantName?: string }> = [];

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    this.sentEmails.push({ to, type: 'password-reset', token });
  }
  async sendInvitationEmail(to: string, token: string, tenantName: string): Promise<void> {
    this.sentEmails.push({ to, type: 'invitation', token, tenantName });
  }

  /**
   * Business-event mail (Â§6.6). Recorded with an empty token because, unlike
   * the two above, it carries no capability â€” these assertions are about who
   * was mailed, not about a link they can act on.
   */
  async sendTransactionalEmail(to: string, _subject: string, _html: string): Promise<void> {
    this.sentEmails.push({ to, type: 'transactional', token: '' });
  }
  async sendWorkspaceCreatedEmail(
    to: string,
    _params: { companyName: string; urlSlug: string; ownerPassword: string }
  ): Promise<void> {
    this.sentEmails.push({ to, type: 'workspace-created', token: '' });
  }

  clear(): void { this.sentEmails = []; }
}

/**
 * Hands the suite's in-memory repositories to the provisioning work.
 *
 * Replaces the former `FakeUnitOfWork`. The difference matters even in a test
 * double: the real port's contract is "here are repositories you should write
 * through", so a double that ignored them and let the use case reach for its
 * own would not be exercising the same shape as production. Real atomicity is
 * asserted against a database in
 * tests/integration/tenant/tenantProvisioningAtomicity.test.ts.
 */
class FakeTenantProvisioningTransaction implements ITenantProvisioningTransaction {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly userRepo: IUserRepository
  ) {}

  async run<T>(work: (repos: TenantProvisioningRepos) => Promise<T>): Promise<T> {
    return work({
      tenantRepo: this.tenantRepo,
      userRepo: this.userRepo,
      roleSeeder: { seed: async () => ({}) as Record<RoleKey, string> },
      lookupSeeder: { seed: async () => {} },
      pricingSeeder: { seed: async () => {} },
      salesScriptSeeder: { seed: async () => {} },
    });
  }
}

/**
 * Slice 3: `loadAccess` resolves `req.access` through `IAccessRepository`,
 * separately from `IUserRepository` (it is a dedicated read model over
 * User + Role + RolePermission — see PrismaAccessRepository). These fixtures
 * never seed a Role, so `roleId` is always null and every user resolves via
 * `LegacyRoleMapping` (D2) — exactly the BUSINESS_OWNER/STAFF behaviour these
 * tests already assume.
 */
class FakeAccessRepository implements IAccessRepository {
  constructor(private readonly userRepo: IUserRepository) {}

  async findAccessRecord(tenantId: string, userId: string): Promise<AccessRecord | null> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.tenantId !== tenantId) {
      return null;
    }
    return {
      userId: user.id,
      tenantId,
      legacyRole: user.role,
      roleId: null,
      roleKey: null,
      isActive: user.isActive,
      deletedAt: user.deletedAt,
      grants: {},
    };
  }
}

/** Every tenant has the five system roles, with ids `role-<KEY>`. */
class InMemoryRoleCatalogue implements IRoleCatalogue {
  constructor(private readonly userRepo: InMemoryUserRepository) {}

  private roles(): RoleSummary[] {
    return Object.values(RoleKey).map((key) => ({
      id: `role-${key}`,
      key,
      ...SYSTEM_ROLE_NAMES[key],
      isSystem: true,
      baseKey: null,
      grants: DEFAULT_ROLE_MATRIX[key],
    }));
  }
  async list(_tenantId: string): Promise<RoleSummary[]> {
    return this.roles();
  }
  async findById(_tenantId: string, roleId: string): Promise<RoleSummary | null> {
    return this.roles().find((role) => role.id === roleId) ?? null;
  }
  async activeHolderIds(tenantId: string, permissionKey: string): Promise<string[]> {
    const users = await this.userRepo.findByTenantId(tenantId);
    return users
      .filter((u) => u.isActive)
      .filter((u) => {
        const key = u.roleId ? u.roleId.replace(/^role-/, '') : legacyRoleKeyFor(u.role);
        return key !== null && (DEFAULT_ROLE_MATRIX as any)[key]?.[permissionKey] !== undefined;
      })
      .map((u) => u.id);
  }
  async usage(tenantId: string, roleId: string): Promise<RoleUsage> {
    const users = await this.userRepo.findByTenantId(tenantId);
    return { users: users.filter((u) => u.roleId === roleId).length, invitations: 0 };
  }
}

/** Runs user-admin writes straight against the in-memory repositories, collecting audit entries. */
class InMemoryUserAdminTransaction implements IUserAdminTransaction {
  readonly auditEntries: AuditEntry[] = [];

  constructor(
    private readonly userRepo: InMemoryUserRepository,
    private readonly invitationRepo: InMemoryInvitationRepository
  ) {}

  run<T>(work: (repos: UserAdminRepos) => Promise<T>): Promise<T> {
    return work({
      staff: {
        create: async (user) => {
          await this.userRepo.create(user);
        },
        setRole: (_tenantId, userId, change) =>
          this.userRepo.setRole(userId, change.roleId, change.legacyRole, change.warehouseId),
        setActive: (_tenantId, userId, isActive) => this.userRepo.setActive(userId, isActive),
      },
      invitations: this.invitationRepo,
      assignments: { reassignCompanies: async () => [], reassignOpenContracts: async () => [] },
      auditTrail: { record: async (entry) => void this.auditEntries.push(entry) },
    });
  }
}

// ===========================================================================
// INTEGRATION TESTS
// ===========================================================================

describe('Auth Integration Tests', () => {
  let app: express.Express;
  let userRepo: InMemoryUserRepository;
  let tenantRepo: InMemoryTenantRepository;
  let invitationRepo: InMemoryInvitationRepository;
  let prtRepo: InMemoryPasswordResetTokenRepository;
  let passwordHasher: FakePasswordHasher;
  let tokenService: NonCryptographicStubTokenService;
  let emailSender: FakeEmailSender;
  let tenantProvisioningTransaction: FakeTenantProvisioningTransaction;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    tenantRepo = new InMemoryTenantRepository();
    invitationRepo = new InMemoryInvitationRepository();
    prtRepo = new InMemoryPasswordResetTokenRepository();
    passwordHasher = new FakePasswordHasher();
    tokenService = new NonCryptographicStubTokenService();
    emailSender = new FakeEmailSender();
    tenantProvisioningTransaction = new FakeTenantProvisioningTransaction(tenantRepo, userRepo);

    app = createApp({
      userRepository: userRepo,
      tenantRepository: tenantRepo,
      invitationRepository: invitationRepo,
      prtRepository: prtRepo,
      passwordHasher,
      tokenService,
      emailSender,
      tenantProvisioningTransaction,
      accessRepository: new FakeAccessRepository(userRepo),
      roleCatalogue: new InMemoryRoleCatalogue(userRepo),
      userAdminTransaction: new InMemoryUserAdminTransaction(userRepo, invitationRepo),
    });
  });

  /**
   * Seeds a workspace and its owner straight into the fakes.
   *
   * These tests used POST /api/auth/register for this, which was convenient
   * while a public signup route existed. It no longer does, and reaching for
   * POST /api/tenants instead would mean minting a SUPER_ADMIN session just to
   * arrange a fixture â€” coupling every login and invitation test to the
   * platform console. Seeding the repositories directly says what the tests
   * actually need: a tenant, and an owner who can log into it.
   */
  const provisionTenant = async (opts: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerPassword: string;
  }) => {
    const tenant = Tenant.create({
      id: `tenant-${opts.slug}`,
      name: opts.name,
      urlSlug: opts.slug,
      createdAt: new Date(),
    });
    await tenantRepo.create(tenant);

    const owner = User.create({
      id: `user-${opts.slug}-owner`,
      email: opts.ownerEmail,
      hashedPassword: await passwordHasher.hash(opts.ownerPassword),
      role: UserRole.BUSINESS_OWNER,
      tenantId: tenant.id,
      createdAt: new Date(),
    });
    await userRepo.create(owner);

    return { tenant, owner };
  };

  // -----------------------------------------------------------------------
  // 1. WORKSPACE PROVISIONING
  //
  // Public self-registration was removed: a workspace now exists only because a
  // platform administrator created it. The provisioning behaviour these tests
  // used to cover through POST /api/auth/register is covered against
  // POST /api/tenants in tests/integration/tenant/, which is now its only
  // caller. What remains here is the guarantee that the public route is gone.
  // -----------------------------------------------------------------------
  describe('POST /api/auth/register', () => {
    it('FR-BR-05 no longer exists — workspaces are provisioned by a platform admin only', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          companyName: 'Acme Corp',
          urlSlug: 'acme',
          ownerEmail: 'owner@acme.com',
          ownerPassword: 'Password1',
        })
        .expect(404);

      expect(tenantRepo.getAll()).toHaveLength(0);
      expect(userRepo.getAll()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. LOGIN
  // -----------------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed a tenant and user via registration
      await provisionTenant({ name: 'Acme Corp', slug: 'acme', ownerEmail: 'owner@acme.com', ownerPassword: 'Password1' });
    });

    it('should login with valid credentials and set the session cookie (200)', async () => {
      const res = await request(app)
        .post('/api/acme/auth/login')
        .send({ email: 'owner@acme.com', password: 'Password1' })
        .expect(200);

      const token = cookieJwt(res);
      expect(token).toBeDefined();
      const payload = tokenService.verify(token!);
      expect(payload.role).toBe(UserRole.BUSINESS_OWNER);
    });

    it('NFR-SEC-02 keeps the session token out of the login response body, in an HttpOnly cookie only', async () => {
      const res = await request(app)
        .post('/api/acme/auth/login')
        .send({ email: 'owner@acme.com', password: 'Password1' })
        .expect(200);

      expect(res.body.token).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(cookieJwt(res)!);
      expect(jwtCookieLine(res)).toMatch(/;\s*HttpOnly/i);
    });

    it('NFR-SEC-02 marks the session cookie Secure and SameSite=None in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app)
          .post('/api/acme/auth/login')
          .send({ email: 'owner@acme.com', password: 'Password1' })
          .expect(200);

        const line = jwtCookieLine(res)!;
        expect(line).toMatch(/;\s*HttpOnly/i);
        expect(line).toMatch(/;\s*Secure/i);
        expect(line).toMatch(/;\s*SameSite=None/i);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should reject invalid password (401)', async () => {
      const res = await request(app)
        .post('/api/acme/auth/login')
        .send({ email: 'owner@acme.com', password: 'WrongPass1' })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should reject login with non-existent tenant slug (401)', async () => {
      const res = await request(app)
        .post('/api/no-such-tenant/auth/login')
        .send({ email: 'owner@acme.com', password: 'Password1' })
        .expect(404); // Expect 404 since tenant doesn't exist

      expect(res.body.error).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 3. REGISTER â†’ LOGIN â†’ INVITE STAFF (full flow)
  // -----------------------------------------------------------------------
  describe('Full Registration â†’ Login â†’ Invite flow', () => {
    let ownerToken: string;
    let tenantId: string;

    beforeEach(async () => {
      // Register
      await provisionTenant({ name: 'Acme Corp', slug: 'acme', ownerEmail: 'owner@acme.com', ownerPassword: 'Password1' });

      tenantId = tenantRepo.getAll()[0].id;

      // Login
      const loginRes = await request(app)
        .post('/api/acme/auth/login')
        .send({ email: 'owner@acme.com', password: 'Password1' });

      ownerToken = cookieJwt(loginRes)!;
    });

    it('should allow BUSINESS_OWNER to invite staff (200)', async () => {
      const res = await request(app)
        .post('/api/acme/auth/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'staff@acme.com', roleId: 'role-SALES_USER' })
        .expect(200);

      expect(res.body.message).toBe('Invitation sent');

      // Verify invitation was created
      const invitations = invitationRepo.getAll();
      expect(invitations).toHaveLength(1);
      expect(invitations[0].email).toBe('staff@acme.com');

      // Verify email was sent
      expect(emailSender.sentEmails).toHaveLength(1);
      expect(emailSender.sentEmails[0].type).toBe('invitation');
      expect(emailSender.sentEmails[0].to).toBe('staff@acme.com');
    });

    it('should reject invitation from unauthenticated user (401)', async () => {
      await request(app)
        .post('/api/acme/auth/invitations')
        .send({ email: 'staff@acme.com', roleId: 'role-SALES_USER' })
        .expect(401);
    });

    it('should reject invitation from STAFF user (403)', async () => {
      // Manually add a STAFF user
      const staffUser = User.create({
        id: 'staff-id',
        email: 'staff-existing@acme.com',
        hashedPassword: 'hashed:SomePass1',
        role: UserRole.STAFF,
        tenantId,
        createdAt: new Date(),
      });
      await userRepo.create(staffUser);

      const staffToken = tokenService.sign({
        userId: staffUser.id,
        role: UserRole.STAFF,
        tenantId: staffUser.tenantId,
        tenantSlug: 'acme',
        warehouseId: null,
      });

      await request(app)
        .post('/api/acme/auth/invitations')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ email: 'another@acme.com', roleId: 'role-SALES_USER' })
        .expect(403);
    });

    it('should return 403 when user tries to invite on a different tenant', async () => {
      // Create a second tenant
      const otherTenant = Tenant.create({
        id: 'other-tenant-id',
        name: 'Other Corp',
        urlSlug: 'other-corp',
        createdAt: new Date(),
      });
      await tenantRepo.create(otherTenant);

      // Owner of acme tries to invite on other-corp
      await request(app)
        .post('/api/other-corp/auth/invitations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'staff@other.com', roleId: 'role-SALES_USER' })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------------
  // 4. ACCEPT INVITATION
  // -----------------------------------------------------------------------
  describe('POST /api/auth/invitations/accept', () => {
    let invitationToken: string;

    beforeEach(async () => {
      // Seed a tenant
      const tenant = Tenant.create({
        id: 'tenant-1',
        name: 'Acme',
        urlSlug: 'acme',
        createdAt: new Date(),
      });
      await tenantRepo.create(tenant);

      // Seed an invitation
      invitationToken = 'valid-invitation-token';
      const invitation = Invitation.create({
        id: 'inv-1',
        tenantId: 'tenant-1',
        email: 'newstaff@acme.com',
        role: UserRole.STAFF,
        token: invitationToken,
        expiresAt: new Date(Date.now() + 86400000), // 24h from now
        acceptedAt: null,
      });
      await invitationRepo.create(invitation);
    });

    it('should accept a valid invitation and create a user (200)', async () => {
      const res = await request(app)
        .post('/api/auth/invitations/accept')
        .send({ token: invitationToken, newPassword: 'NewPass123' })
        .expect(200);

      expect(res.body.message).toBe('Invitation accepted successfully');

      // Verify a user was created
      const users = userRepo.getAll();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('newstaff@acme.com');
      expect(users[0].role).toBe(UserRole.STAFF);
      expect(users[0].tenantId).toBe('tenant-1');
    });

    it('should reject an already-accepted invitation (400)', async () => {
      // Accept first time
      await request(app)
        .post('/api/auth/invitations/accept')
        .send({ token: invitationToken, newPassword: 'NewPass123' })
        .expect(200);

      // Attempt second acceptance
      const res = await request(app)
        .post('/api/auth/invitations/accept')
        .send({ token: invitationToken, newPassword: 'NewPass123' })
        .expect(400);

      expect(res.body.error).toContain('already been accepted');
    });

    it('should reject an expired invitation (400)', async () => {
      // Create an already-expired invitation
      const expiredInvitation = Invitation.create({
        id: 'inv-expired',
        tenantId: 'tenant-1',
        email: 'expired@acme.com',
        role: UserRole.STAFF,
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        acceptedAt: null,
      });
      await invitationRepo.create(expiredInvitation);

      const res = await request(app)
        .post('/api/auth/invitations/accept')
        .send({ token: 'expired-token', newPassword: 'NewPass123' })
        .expect(400);

      expect(res.body.error).toContain('expired');
    });
  });

  // -----------------------------------------------------------------------
  // 4b. GET /api/auth/me — Slice 3 permissions
  // -----------------------------------------------------------------------
  describe('GET /api/auth/me (FR-RBAC-01, enabler for FR-USR-03)', () => {
    it('returns permissions (D2 legacy mapping) and an X-Permissions-Version header', async () => {
      await provisionTenant({ name: 'Acme Corp', slug: 'acme', ownerEmail: 'owner@acme.com', ownerPassword: 'Password1' });
      const loginRes = await request(app)
        .post('/api/acme/auth/login')
        .send({ email: 'owner@acme.com', password: 'Password1' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${cookieJwt(loginRes)}`)
        .expect(200);

      // BUSINESS_OWNER -> Administrator (D2): holds users.manage.
      expect(res.body.user.permissions['users.manage']).toBe(true);
      expect(typeof res.body.user.permissionsVersion).toBe('string');
      expect(res.headers['x-permissions-version']).toBe(res.body.user.permissionsVersion);
    });
  });

  // -----------------------------------------------------------------------
  // 5. PASSWORD RESET FLOW
  // -----------------------------------------------------------------------
  describe('Password Reset Flow', () => {
    beforeEach(async () => {
      // Seed a tenant + user
      const tenant = Tenant.create({
        id: 'tenant-1',
        name: 'Acme',
        urlSlug: 'acme',
        createdAt: new Date(),
      });
      await tenantRepo.create(tenant);

      const user = User.create({
        id: 'user-1',
        email: 'user@acme.com',
        hashedPassword: 'hashed:OldPassword1',
        role: UserRole.BUSINESS_OWNER,
        tenantId: 'tenant-1',
        createdAt: new Date(),
      });
      await userRepo.create(user);
    });

    describe('POST /api/auth/password-reset/request', () => {
      it('should send a reset email for existing user (200)', async () => {
        const res = await request(app)
          .post('/api/acme/auth/password-reset/request')
          .send({ email: 'user@acme.com' })
          .expect(200);

        expect(res.body.message).toContain('reset link');

        // Verify email was sent
        expect(emailSender.sentEmails).toHaveLength(1);
        expect(emailSender.sentEmails[0].type).toBe('password-reset');

        // Verify token was stored
        expect(prtRepo.getAll()).toHaveLength(1);
      });

      it('should return 200 even if user does not exist (silent fail)', async () => {
        const res = await request(app)
          .post('/api/acme/auth/password-reset/request')
          .send({ email: 'nonexistent@acme.com' })
          .expect(200);

        // Should not have sent any email
        expect(emailSender.sentEmails).toHaveLength(0);
      });
    });

    describe('POST /api/auth/password-reset/reset', () => {
      let resetToken: string;

      beforeEach(async () => {
        // Request a password reset
        await request(app)
          .post('/api/acme/auth/password-reset/request')
          .send({ email: 'user@acme.com' });

        // Get the token from the email sender
        resetToken = emailSender.sentEmails[0].token;
      });

      it('should reset the password with a valid token (200)', async () => {
        const res = await request(app)
          .post('/api/auth/password-reset/reset')
          .send({ token: resetToken, newPassword: 'NewPassword1' })
          .expect(200);

        expect(res.body.message).toBe('Password reset successfully');

        // Verify the user can now login with the new password
        // First, we need the login route to work â€” seed the tenant slug lookup
        const loginRes = await request(app)
          .post('/api/acme/auth/login')
          .send({ email: 'user@acme.com', password: 'NewPassword1' });

        expect(loginRes.status).toBe(200);
        expect(cookieJwt(loginRes)).toBeDefined();
      });

      it('should reject an already-used token (400)', async () => {
        // Use once
        await request(app)
          .post('/api/auth/password-reset/reset')
          .send({ token: resetToken, newPassword: 'NewPassword1' })
          .expect(200);

        // Attempt re-use
        const res = await request(app)
          .post('/api/auth/password-reset/reset')
          .send({ token: resetToken, newPassword: 'AnotherPass1' })
          .expect(400);

        expect(res.body.error).toContain('already been used');
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. CROSS-TENANT ISOLATION
  // -----------------------------------------------------------------------
  describe('Cross-Tenant Isolation', () => {
    let tenantAOwnerToken: string;
    let tenantBOwnerToken: string;

    beforeEach(async () => {
      // Register Tenant A
      await provisionTenant({ name: 'Tenant A', slug: 'tenant-a', ownerEmail: 'owner@tenant-a.com', ownerPassword: 'Password1' });

      // Register Tenant B
      await provisionTenant({ name: 'Tenant B', slug: 'tenant-b', ownerEmail: 'owner@tenant-b.com', ownerPassword: 'Password1' });

      // Login as Tenant A owner
      const loginA = await request(app)
        .post('/api/tenant-a/auth/login')
        .send({ email: 'owner@tenant-a.com', password: 'Password1' });
      tenantAOwnerToken = cookieJwt(loginA)!;

      // Login as Tenant B owner
      const loginB = await request(app)
        .post('/api/tenant-b/auth/login')
        .send({ email: 'owner@tenant-b.com', password: 'Password1' });
      tenantBOwnerToken = cookieJwt(loginB)!;
    });

    it('should return 403 when Tenant A owner tries to access Tenant B', async () => {
      await request(app)
        .post('/api/tenant-b/auth/invitations')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .send({ email: 'staff@b.com', roleId: 'role-SALES_USER' })
        .expect(403);
    });

    it('should return 403 when Tenant B owner tries to access Tenant A', async () => {
      await request(app)
        .post('/api/tenant-a/auth/invitations')
        .set('Authorization', `Bearer ${tenantBOwnerToken}`)
        .send({ email: 'staff@a.com', roleId: 'role-SALES_USER' })
        .expect(403);
    });

    // SUPER_ADMIN is platform-level only: it administers tenants themselves, not
    // any individual business's data. It gets no exemption from tenant scoping.
    it('should return 403 when SUPER_ADMIN tries to act on a tenant-scoped route', async () => {
      // Manually add a SUPER_ADMIN
      const sa = User.create({
        id: 'sa-id',
        email: 'super@crm.com',
        hashedPassword: 'hashed:SuperPass1',
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        createdAt: new Date(),
      });
      await userRepo.create(sa);

      const saToken = tokenService.sign({
        userId: sa.id,
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        tenantSlug: null,
        warehouseId: null,
      });

      const res = await request(app)
        .post('/api/tenant-a/auth/invitations')
        .set('Authorization', `Bearer ${saToken}`)
        .send({ email: 'new-staff@a.com', roleId: 'role-SALES_USER' })
        .expect(403);

      // Denied by the tenant guard, not crashed on a null tenantId.
      expect(res.body).toEqual({ error: 'Cross-tenant access forbidden' });
    });
  });

  // -----------------------------------------------------------------------
  // 7. VALIDATION MIDDLEWARE
  // -----------------------------------------------------------------------
  describe('Request Validation', () => {
    it('should reject login with missing email (400)', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ password: 'Password1' }) // Missing email
        .expect(400);
    });

    it('should reject accept-invitation with missing token (400)', async () => {
      await request(app)
        .post('/api/auth/invitations/accept')
        .send({ newPassword: 'Password1' }) // Missing token
        .expect(400);
    });

    it('should reject password reset with weak new password (400)', async () => {
      await request(app)
        .post('/api/auth/password-reset/reset')
        .send({ token: 'some-token', newPassword: '123' }) // Weak password
        .expect(400);
    });
  });
});

