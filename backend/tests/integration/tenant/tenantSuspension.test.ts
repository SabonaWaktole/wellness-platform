import request from 'supertest';
import { cookieJwt } from '../../support/cookieJwt';
import { createApp } from '../../../src/main/app';
import { PrismaClient } from '@prisma/client';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { BcryptPasswordHasher } from '../../../src/auth/infrastructure/BcryptPasswordHasher';
import { v4 as uuidv4 } from 'uuid';

/**
 * Suspension enforcement, end to end.
 *
 * The decision this pins: suspension must bite at BOTH login and session level.
 *
 * Login-only enforcement would not be enough. `authenticate` never reads the
 * database — it verifies the JWT signature and trusts the payload — and there
 * is no revocation, so a token issued before the suspension stays valid until
 * it expires (JWT_EXPIRATION, currently 1h). A tenant suspended for
 * non-payment would keep working for up to an hour. See TD-010.
 *
 * The `resolveTenant` tests below are therefore the important ones: they use a
 * token minted BEFORE the suspension and assert it stops working immediately.
 */
describe('Tenant suspension enforcement', () => {
  let app: any;
  let prisma: PrismaClient;
  let tokenService: JwtTokenService;
  let hasher: BcryptPasswordHasher;

  let tenantId: string;
  let otherTenantId: string;
  let slug: string;
  let otherSlug: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let superAdminToken: string;

  const ownerEmail = `owner-${uuidv4()}@example.com`;
  const ownerPassword = 'StrongPassword123';

  // One representative endpoint per tenant-scoped module, as in
  // superAdminTenantScope.test.ts.
  const endpoints = [
    { module: 'Clients', path: (s: string) => `/api/${s}/clients/search` },
    { module: 'Appointments', path: (s: string) => `/api/${s}/appointments/search` },
    { module: 'Inventory', path: (s: string) => `/api/${s}/inventory/warehouses` },
    { module: 'Quotations', path: (s: string) => `/api/${s}/quotations` },
  ];

  const setStatus = (id: string, subscriptionStatus: 'ACTIVE' | 'SUSPENDED') =>
    prisma.tenant.update({ where: { id }, data: { subscriptionStatus } });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = createApp();
    tokenService = new JwtTokenService();
    hasher = new BcryptPasswordHasher();

    tenantId = uuidv4();
    otherTenantId = uuidv4();
    slug = `susp-${Date.now()}`;
    otherSlug = `other-${Date.now()}`;

    await prisma.tenant.create({ data: { id: tenantId, name: 'Suspendable', urlSlug: slug } });
    await prisma.tenant.create({
      data: { id: otherTenantId, name: 'Bystander', urlSlug: otherSlug },
    });

    const ownerId = uuidv4();
    const otherOwnerId = uuidv4();
    const superAdminId = uuidv4();

    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: ownerEmail,
          hashedPassword: await hasher.hash(ownerPassword),
          role: 'BUSINESS_OWNER',
          tenantId,
        },
        {
          id: otherOwnerId,
          email: `other-${uuidv4()}@example.com`,
          hashedPassword: await hasher.hash(ownerPassword),
          role: 'BUSINESS_OWNER',
          tenantId: otherTenantId,
        },
        {
          id: superAdminId,
          email: `sa-${uuidv4()}@example.com`,
          hashedPassword: await hasher.hash(ownerPassword),
          role: 'SUPER_ADMIN',
        },
      ],
    });

    // Minted while both tenants are ACTIVE. That is the whole point: these
    // tokens predate every suspension in this file.
    ownerToken = tokenService.sign({
      userId: ownerId,
      role: 'BUSINESS_OWNER',
      tenantId,
      tenantSlug: slug,
      warehouseId: null,
    });
    otherOwnerToken = tokenService.sign({
      userId: otherOwnerId,
      role: 'BUSINESS_OWNER',
      tenantId: otherTenantId,
      tenantSlug: otherSlug,
      warehouseId: null,
    });
    superAdminToken = tokenService.sign({
      userId: superAdminId,
      role: 'SUPER_ADMIN',
      tenantId: null,
      tenantSlug: null,
      warehouseId: null,
    });
  }, 60000);

  afterAll(async () => {
    const ids = [tenantId, otherTenantId];
    await prisma.notification.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { role: 'SUPER_ADMIN', tenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await setStatus(tenantId, 'ACTIVE');
    await setStatus(otherTenantId, 'ACTIVE');
  });

  // -----------------------------------------------------------------------
  // Login-time
  // -----------------------------------------------------------------------
  describe('login', () => {
    it('refuses login to a suspended workspace with a message naming the reason', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      const res = await request(app)
        .post(`/api/${slug}/auth/login`)
        .send({ email: ownerEmail, password: ownerPassword });

      expect(res.status).toBe(401);
      // Deliberately NOT the generic invalid-credentials message: a customer
      // with a correct password must not be sent to reset it. See
      // TenantSuspendedError.
      expect(res.body.error).toMatch(/suspended/i);
      expect(res.body.error).not.toMatch(/invalid email or password/i);
      expect(cookieJwt(res)).toBeUndefined();
    });

    it('still refuses a WRONG password on a suspended workspace with the generic error', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      const res = await request(app)
        .post(`/api/${slug}/auth/login`)
        .send({ email: ownerEmail, password: 'WrongPassword123' });

      // Suspension is checked AFTER the password, so someone who cannot
      // authenticate cannot use this endpoint to probe which workspaces are
      // suspended.
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
      expect(res.body.error).not.toMatch(/suspended/i);
    });

    it('allows login again once reactivated', async () => {
      await setStatus(tenantId, 'SUSPENDED');
      await setStatus(tenantId, 'ACTIVE');

      const res = await request(app)
        .post(`/api/${slug}/auth/login`)
        .send({ email: ownerEmail, password: ownerPassword });

      expect(res.status).toBe(200);
      expect(cookieJwt(res)).toBeDefined();
    });

    it('blocks the REST of the tenant auth router when suspended', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      // The login route defers its suspension check to LoginUseCase so it
      // cannot be used for enumeration. That exemption must not leak to the
      // rest of the router: a suspended workspace should not be sending
      // password-reset mail or issuing staff invitations.
      const reset = await request(app)
        .post(`/api/${slug}/auth/password-reset/request`)
        .send({ email: ownerEmail });
      expect(reset.status).toBe(403);
      expect(reset.body.code).toBe('TENANT_SUSPENDED');

      const staff = await request(app)
        .get(`/api/${slug}/auth/staff`)
        .set('Cookie', [`jwt=${ownerToken}`]);
      expect(staff.status).toBe(403);
      expect(staff.body.code).toBe('TENANT_SUSPENDED');
    });

    it('does not lock out SUPER_ADMIN, who belongs to no tenant', async () => {
      await setStatus(tenantId, 'SUSPENDED');
      await setStatus(otherTenantId, 'SUSPENDED');

      // The platform administrator is the only role that can lift a
      // suspension. If suspending every tenant could lock them out, the system
      // would have no way back.
      const res = await request(app)
        .get('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`]);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Session-level — the TD-010 window
  // -----------------------------------------------------------------------
  describe('already-issued tokens', () => {
    it.each(endpoints)(
      '$module rejects a pre-suspension token immediately, mid-session',
      async ({ path }) => {
        // Works before.
        const before = await request(app)
          .get(path(slug))
          .set('Cookie', [`jwt=${ownerToken}`]);
        expect(before.status).not.toBe(403);

        await setStatus(tenantId, 'SUSPENDED');

        // Same token, no re-login, no waiting for expiry.
        const after = await request(app)
          .get(path(slug))
          .set('Cookie', [`jwt=${ownerToken}`]);

        expect(after.status).toBe(403);
        expect(after.body.code).toBe('TENANT_SUSPENDED');
      }
    );

    it('restores access on the same token once reactivated', async () => {
      await setStatus(tenantId, 'SUSPENDED');
      const suspended = await request(app)
        .get(`/api/${slug}/clients/search`)
        .set('Cookie', [`jwt=${ownerToken}`]);
      expect(suspended.status).toBe(403);

      await setStatus(tenantId, 'ACTIVE');
      const restored = await request(app)
        .get(`/api/${slug}/clients/search`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      // Suspension retains everything; reactivation is a full restoration, not
      // a re-onboarding.
      expect(restored.status).not.toBe(403);
    });

    it('drops the browser session at /auth/me', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      const res = await request(app).get('/api/auth/me').set('Cookie', [`jwt=${ownerToken}`]);

      // /api/auth/me carries no tenant slug and so never reaches resolveTenant.
      // Without its own check, a suspended tenant's user would bootstrap a
      // normal-looking session and then hit 403 everywhere — reading as a
      // broken app rather than a suspended workspace.
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_SUSPENDED');
    });

    it('leaves /auth/me working for an active workspace', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', [`jwt=${ownerToken}`]);
      expect(res.status).toBe(200);
      expect(res.body.user.tenantId).toBe(tenantId);
    });
  });

  // -----------------------------------------------------------------------
  // Isolation
  // -----------------------------------------------------------------------
  describe('isolation', () => {
    it('suspending one workspace does not affect another', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      const bystander = await request(app)
        .get(`/api/${otherSlug}/clients/search`)
        .set('Cookie', [`jwt=${otherOwnerToken}`]);

      expect(bystander.status).not.toBe(403);

      const bystanderLogin = await request(app).get('/api/auth/me').set('Cookie', [`jwt=${otherOwnerToken}`]);
      expect(bystanderLogin.status).toBe(200);
    });

    it('suspension does not delete or deactivate anything', async () => {
      const usersBefore = await prisma.user.count({ where: { tenantId } });

      await setStatus(tenantId, 'SUSPENDED');

      const tenantAfter = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const usersAfter = await prisma.user.findMany({ where: { tenantId } });

      // Data retention is the defining property of suspension as specified.
      expect(tenantAfter).not.toBeNull();
      expect(usersAfter).toHaveLength(usersBefore);
      expect(usersAfter.every((u) => u.isActive)).toBe(true);
    });

    it('a suspended tenant still owns its slug — nobody can provision over it', async () => {
      await setStatus(tenantId, 'SUSPENDED');

      // Aimed at POST /api/tenants rather than the old public register route,
      // which no longer exists. Same provisioning code path underneath
      // (CreateTenantWithOwnerUseCase), stricter caller.
      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send({
          companyName: 'Slug Hijack',
          urlSlug: slug,
          ownerEmail: `hijack-${uuidv4()}@example.com`,
          ownerPassword: 'StrongPassword123',
        });

      // If suspension ever started excluding tenants from slug lookups, a
      // stranger could claim a paying customer's workspace URL while they were
      // suspended. It must stay refused.
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already taken/i);
    });
  });
});
