import request from 'supertest';
import { cookieJwt } from '../../support/cookieJwt';
import { createApp } from '../../../src/main/app';
import { PrismaClient } from '@prisma/client';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Super Admin tenant provisioning endpoints.
 *
 * These are platform-level: they carry no :tenantSlug, so `resolveTenant` never
 * runs on them and `authenticate` + `authorize([SUPER_ADMIN])` is the whole
 * access control. The gating tests below are therefore the security boundary
 * for the entire feature, not a formality.
 */
describe('Tenant admin routes', () => {
  let app: any;
  let prisma: PrismaClient;
  let tokenService: JwtTokenService;

  let superAdminToken: string;
  let ownerToken: string;
  let staffToken: string;

  let seedTenantId: string;
  let seedSlug: string;
  const createdSlugs: string[] = [];

  const newTenantPayload = (overrides: Record<string, unknown> = {}) => {
    const slug = `admin-created-${uuidv4().slice(0, 8)}`;
    createdSlugs.push(slug);
    return {
      companyName: 'Admin Created Co',
      urlSlug: slug,
      ownerEmail: `owner-${uuidv4()}@example.com`,
      ownerPassword: 'StrongPassword123',
      ...overrides,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = createApp();
    tokenService = new JwtTokenService();

    seedTenantId = uuidv4();
    seedSlug = `admin-seed-${Date.now()}`;
    createdSlugs.push(seedSlug);
    await prisma.tenant.create({
      data: { id: seedTenantId, name: 'Seed Co', urlSlug: seedSlug },
    });

    const ownerId = uuidv4();
    const staffId = uuidv4();
    const superAdminId = uuidv4();
    await prisma.user.createMany({
      data: [
        { id: ownerId, email: `bo-${uuidv4()}@t.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId: seedTenantId },
        { id: staffId, email: `st-${uuidv4()}@t.com`, hashedPassword: 'x', role: 'STAFF', tenantId: seedTenantId },
        { id: superAdminId, email: `sa-${uuidv4()}@t.com`, hashedPassword: 'x', role: 'SUPER_ADMIN' },
      ],
    });

    superAdminToken = tokenService.sign({ userId: superAdminId, role: 'SUPER_ADMIN', tenantId: null, tenantSlug: null, warehouseId: null });
    ownerToken = tokenService.sign({ userId: ownerId, role: 'BUSINESS_OWNER', tenantId: seedTenantId, tenantSlug: seedSlug, warehouseId: null });
    staffToken = tokenService.sign({ userId: staffId, role: 'STAFF', tenantId: seedTenantId, tenantSlug: seedSlug, warehouseId: null });
  }, 60000);

  afterAll(async () => {
    const tenants = await prisma.tenant.findMany({
      where: { urlSlug: { in: createdSlugs } },
      select: { id: true },
    });
    const ids = tenants.map((t) => t.id);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.user.deleteMany({ where: { role: 'SUPER_ADMIN', tenantId: null } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.tenant.update({
      where: { id: seedTenantId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
  });

  // -----------------------------------------------------------------------
  // Role gating — every route, every non-admin role
  // -----------------------------------------------------------------------
  describe('role gating', () => {
    const routes = [
      { name: 'POST /api/tenants', call: (t?: string) => {
        const r = request(app).post('/api/tenants').send({
          companyName: 'X', urlSlug: `gate-${uuidv4().slice(0, 8)}`,
          ownerEmail: 'x@y.com', ownerPassword: 'StrongPassword123',
        });
        return t ? r.set('Cookie', [`jwt=${t}`]) : r;
      } },
      { name: 'PATCH suspend', call: (t?: string) => {
        const r = request(app).patch(`/api/tenants/${seedTenantId}/suspend`);
        return t ? r.set('Cookie', [`jwt=${t}`]) : r;
      } },
      { name: 'PATCH reactivate', call: (t?: string) => {
        const r = request(app).patch(`/api/tenants/${seedTenantId}/reactivate`);
        return t ? r.set('Cookie', [`jwt=${t}`]) : r;
      } },
    ];

    it.each(routes)('$name returns 401 unauthenticated', async ({ call }) => {
      expect((await call(undefined)).status).toBe(401);
    });

    it.each(routes)('$name returns 403 for BUSINESS_OWNER', async ({ call }) => {
      expect((await call(ownerToken)).status).toBe(403);
    });

    it.each(routes)('$name returns 403 for STAFF', async ({ call }) => {
      expect((await call(staffToken)).status).toBe(403);
    });

    it('a business owner cannot suspend their OWN tenant', async () => {
      // The tempting mistake: treating "it's my tenant" as authority. Suspension
      // is a platform-billing act, not a workspace setting.
      const res = await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(res.status).toBe(403);
      const after = await prisma.tenant.findUnique({ where: { id: seedTenantId } });
      expect(after!.subscriptionStatus).toBe('ACTIVE');
    });
  });

  // -----------------------------------------------------------------------
  // Creation
  // -----------------------------------------------------------------------
  describe('POST /api/tenants', () => {
    it('creates a tenant and its owner, active and able to log in', async () => {
      const payload = newTenantPayload();

      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.tenant.urlSlug).toBe(payload.urlSlug);
      expect(res.body.tenant.subscriptionStatus).toBe('ACTIVE');
      expect(res.body.owner.email).toBe(payload.ownerEmail);
      expect(res.body.owner.role).toBe('BUSINESS_OWNER');

      // The owner an admin creates must be a real, usable account — otherwise
      // the admin path produces a workspace nobody can get into, which is the
      // orphan-tenant failure by another route.
      const login = await request(app)
        .post(`/api/${payload.urlSlug}/auth/login`)
        .send({ email: payload.ownerEmail, password: payload.ownerPassword });
      expect(login.status).toBe(200);
      expect(cookieJwt(login)).toBeDefined();
    });

    it('never echoes the password or its hash', async () => {
      const payload = newTenantPayload();
      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send(payload);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain(payload.ownerPassword);
      expect(body).not.toContain('hashedPassword');
    });

    it('rejects a duplicate slug with 409 and creates nothing', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send(newTenantPayload({ urlSlug: seedSlug }));

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already taken/i);
    });

    it.each([
      ['missing companyName', { companyName: undefined }],
      ['invalid slug characters', { urlSlug: 'Not A Slug!' }],
      ['invalid email', { ownerEmail: 'not-an-email' }],
      ['weak password', { ownerPassword: 'short' }],
    ])('rejects %s with 400', async (_label, override) => {
      const payload: any = newTenantPayload(override as Record<string, unknown>);
      if (override && 'companyName' in override) delete payload.companyName;

      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('strips undeclared fields rather than passing them through', async () => {
      // validateRequest replaces req.body with the parsed value, so a client
      // cannot smuggle extra keys into the use case. TD-011.
      const payload = newTenantPayload();
      const res = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send({ ...payload, subscriptionStatus: 'SUSPENDED', role: 'SUPER_ADMIN' });

      expect(res.status).toBe(201);
      // The smuggled status did not take effect.
      expect(res.body.tenant.subscriptionStatus).toBe('ACTIVE');
      const owner = await prisma.user.findFirst({ where: { email: payload.ownerEmail } });
      expect(owner!.role).toBe('BUSINESS_OWNER');
    });
  });

  // -----------------------------------------------------------------------
  // Suspend / reactivate
  // -----------------------------------------------------------------------
  describe('PATCH suspend / reactivate', () => {
    it('suspends, then reactivates', async () => {
      const suspended = await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);
      expect(suspended.status).toBe(200);
      expect(suspended.body.tenant.subscriptionStatus).toBe('SUSPENDED');

      const reactivated = await request(app)
        .patch(`/api/tenants/${seedTenantId}/reactivate`)
        .set('Cookie', [`jwt=${superAdminToken}`]);
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.tenant.subscriptionStatus).toBe('ACTIVE');
    });

    it('is idempotent: suspending twice succeeds both times', async () => {
      const first = await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);
      const second = await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);

      // A double-click or a retry after a timeout must not read as a failure.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.tenant.subscriptionStatus).toBe('SUSPENDED');
    });

    it('is idempotent: reactivating an active tenant succeeds', async () => {
      const res = await request(app)
        .patch(`/api/tenants/${seedTenantId}/reactivate`)
        .set('Cookie', [`jwt=${superAdminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.tenant.subscriptionStatus).toBe('ACTIVE');
    });

    it('returns 404 for an unknown tenant', async () => {
      const res = await request(app)
        .patch(`/api/tenants/${uuidv4()}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);

      expect(res.status).toBe(404);
    });

    it('affects only the targeted tenant', async () => {
      const other = await request(app)
        .post('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`])
        .send(newTenantPayload());
      const otherId = other.body.tenant.id;

      await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);

      const untouched = await prisma.tenant.findUnique({ where: { id: otherId } });
      expect(untouched!.subscriptionStatus).toBe('ACTIVE');
    });
  });

  // -----------------------------------------------------------------------
  // Listing
  // -----------------------------------------------------------------------
  describe('GET /api/tenants', () => {
    it('exposes subscriptionStatus on every row', async () => {
      const res = await request(app)
        .get('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      // The console cannot offer suspend/reactivate without knowing the current
      // state; a row missing this would render as active whatever it is.
      expect(res.body.items.every((t: any) => ['ACTIVE', 'SUSPENDED'].includes(t.subscriptionStatus))).toBe(true);
    });

    it('lists suspended tenants rather than hiding them', async () => {
      await request(app)
        .patch(`/api/tenants/${seedTenantId}/suspend`)
        .set('Cookie', [`jwt=${superAdminToken}`]);

      const res = await request(app)
        .get('/api/tenants')
        .set('Cookie', [`jwt=${superAdminToken}`]);

      const seed = res.body.items.find((t: any) => t.id === seedTenantId);
      // Filtering suspended tenants out of the admin console would hide exactly
      // the rows an operator needs in order to reactivate them.
      expect(seed).toBeDefined();
      expect(seed.subscriptionStatus).toBe('SUSPENDED');
    });
  });
});
