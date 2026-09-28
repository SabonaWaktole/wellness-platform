import request from 'supertest';
import { createApp } from '../../../src/main/app';
import { PrismaClient } from '@prisma/client';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { ClientStatus } from '../../../src/clients/domain/enums/ClientStatus';
import { v4 as uuidv4 } from 'uuid';

/**
 * Role-based visibility on the dashboard.
 *
 * STAFF see only records they own; BUSINESS_OWNER sees the whole tenant. Both
 * roles are asserted explicitly on the same fixture set, so a regression that
 * widens staff visibility OR narrows the owner's is caught.
 *
 * Ownership is per-entity: Client.assignedUserId, Appointment.assignedUserId,
 * Quotation.createdByUserId. Product/StockLevel have no owner column, so the
 * stock figures are tenant-wide for every role by design.
 */
describe('Dashboard role-based data scoping', () => {
  let app: any;
  let prisma: PrismaClient;
  let tokenService: JwtTokenService;

  let tenantId: string;
  let ownerId: string;
  let staffId: string;
  let otherStaffId: string;
  let ownerToken: string;
  let staffToken: string;

  // Unique per run: urlSlug is a unique column, and suites that leave rows
  // behind would otherwise collide with a fixed literal depending on which
  // suites shared this Jest worker. See TD-001.
  let slug = '';
  let staffClientId: string;
  let otherStaffClientId: string;

  const DAY_MS = 24 * 60 * 60_000;
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = createApp();
    tokenService = new JwtTokenService();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    ownerId = uuidv4();
    staffId = uuidv4();
    otherStaffId = uuidv4();
    slug = `dash-scope-${tenantId.slice(0, 8)}`;

    await prisma.tenant.create({
      data: { id: tenantId, name: 'Scope Tenant', urlSlug: slug },
    });

    await prisma.user.createMany({
      data: [
        { id: ownerId, email: `owner-${tenantId}@t.com`, hashedPassword: 'p', role: 'BUSINESS_OWNER', tenantId },
        { id: staffId, email: `staff-${tenantId}@t.com`, hashedPassword: 'p', role: 'STAFF', tenantId },
        { id: otherStaffId, email: `other-${tenantId}@t.com`, hashedPassword: 'p', role: 'STAFF', tenantId },
      ],
    });

    ownerToken = tokenService.sign({ userId: ownerId, role: 'BUSINESS_OWNER', tenantId, tenantSlug: slug, warehouseId: null });
    staffToken = tokenService.sign({ userId: staffId, role: 'STAFF', tenantId, tenantSlug: slug, warehouseId: null });

    // 3 clients in the tenant: 1 owned by our staff member, 2 owned by someone
    // else. A correctly scoped staff view sees exactly 1; the owner sees 3.
    staffClientId = uuidv4();
    otherStaffClientId = uuidv4();
    await prisma.client.createMany({
      data: [
        { id: staffClientId, tenantId, name: 'Staff Own Client', status: ClientStatus.PROSPECT, assignedUserId: staffId, lastUpdatedByUserId: staffId, customFieldValues: {} },
        { id: otherStaffClientId, tenantId, name: 'Other Staff Client', status: ClientStatus.PROSPECT, assignedUserId: otherStaffId, lastUpdatedByUserId: otherStaffId, customFieldValues: {} },
        { id: uuidv4(), tenantId, name: 'Unassigned Client', status: ClientStatus.PROSPECT, lastUpdatedByUserId: ownerId, customFieldValues: {} },
      ],
    });
  });

  afterEach(async () => {
    // Scoped teardown — only rows this file created (see TD-001).
    await prisma.interaction.deleteMany({ where: { tenantId } });
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.notificationSettings.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  describe('GET /dashboard/metrics', () => {
    it('scopes totalClients to the STAFF member’s own clients', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.status).toBe(200);
      // 1 of the 3 tenant clients is assigned to this staff member.
      expect(res.body.totalClients).toBe(1);
    });

    it('still returns tenant-wide totalClients for BUSINESS_OWNER', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.totalClients).toBe(3);
    });

    it('gives STAFF a strictly narrower view than the owner on the same data', async () => {
      const staffRes = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);
      const ownerRes = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(staffRes.body.totalClients).toBeLessThan(ownerRes.body.totalClients);
    });

    it('returns tenant-wide stock figures to STAFF (no per-user ownership exists)', async () => {
      // Documents a deliberate limit: Product/StockLevel have no owner column,
      // so these numbers are not user-scopable and are shared operational data.
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('lowStockProducts');
      expect(res.body).toHaveProperty('outOfStockProducts');
    });
  });

  /**
   * "My assigned clients" is personal for EVERY role, unlike totalClients.
   *
   * The owner fixture below is the point of the pair: the owner can see all
   * three clients, but none is assigned to them, so their personal figure is 0
   * while their tenant-wide one is 3. A regression that wires this card to the
   * tenant count would pass a staff-only test and fail this one.
   */
  describe('GET /dashboard/metrics — assignedClients', () => {
    it('counts only the clients assigned to the requesting STAFF member', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.assignedClients).toBe(1);
    });

    it('stays personal for BUSINESS_OWNER rather than falling back to the tenant count', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.assignedClients).toBe(0);
      expect(res.body.totalClients).toBe(3);
    });
  });

  describe('GET /dashboard/metrics — openFollowUps', () => {
    /** Sent, unanswered, and old enough to need chasing under the default 3 days. */
    const stale = (createdByUserId: string, clientId: string) => ({
      id: uuidv4(),
      tenantId,
      clientId,
      createdByUserId,
      status: 'SENT',
      sentAt: daysAgo(10),
    });

    beforeEach(async () => {
      await prisma.quotation.createMany({
        data: [
          stale(staffId, staffClientId),
          // Sent yesterday: inside the 3-day window, so not yet a follow-up.
          { id: uuidv4(), tenantId, clientId: staffClientId, createdByUserId: staffId, status: 'SENT', sentAt: daysAgo(1) },
          // Old, but the customer answered — no longer outstanding.
          { id: uuidv4(), tenantId, clientId: staffClientId, createdByUserId: staffId, status: 'SENT', sentAt: daysAgo(10), respondedAt: daysAgo(9) },
          // Never sent: a draft cannot be waiting on anyone.
          { id: uuidv4(), tenantId, clientId: staffClientId, createdByUserId: staffId, status: 'DRAFT' },
          // Another rep's stale quotation on their own company — visible to
          // the owner, not to staff (FR-RBAC-11: quotations follow their company).
          stale(otherStaffId, otherStaffClientId),
        ],
      });
    });

    it('counts a STAFF member’s own overdue quotations only', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.openFollowUps).toBe(1);
    });

    it('counts the whole tenant’s overdue quotations for BUSINESS_OWNER', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.openFollowUps).toBe(2);
    });

    it('reports the workspace default threshold when no settings row exists', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.body.followUpThresholdDays).toBe(3);
    });

    it('honours a workspace’s configured follow-up period', async () => {
      // At 14 days, the 10-day-old quotation is not overdue yet. The count has
      // to move with the setting or it means something different from the
      // reminder the workspace actually configured.
      await prisma.notificationSettings.create({
        data: { tenantId, quotationFollowUpDays: 14 },
      });

      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.body.followUpThresholdDays).toBe(14);
      expect(res.body.openFollowUps).toBe(0);
    });

    it('still counts follow-ups when reminder emails are switched off', async () => {
      // The switch governs mail, not the worklist. Turning it off must not make
      // outstanding quotations disappear from the dashboard.
      await prisma.notificationSettings.create({
        data: { tenantId, quotationFollowUpEnabled: false },
      });

      const res = await request(app)
        .get(`/api/${slug}/dashboard/metrics`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.body.openFollowUps).toBe(1);
    });
  });

  describe('GET /dashboard/feed', () => {
    it('returns only the STAFF member’s own activity', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/feed?limit=20`)
        .set('Cookie', [`jwt=${staffToken}`]);

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body.timeline);
      expect(body).toContain('Staff Own Client');
      // The decisive assertion: another staff member's work must not appear.
      expect(body).not.toContain('Other Staff Client');
      expect(body).not.toContain('Unassigned Client');
      expect(res.body.timeline).toHaveLength(1);
    });

    it('still returns the whole tenant’s activity for BUSINESS_OWNER', async () => {
      const res = await request(app)
        .get(`/api/${slug}/dashboard/feed?limit=20`)
        .set('Cookie', [`jwt=${ownerToken}`]);

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body.timeline);
      expect(body).toContain('Staff Own Client');
      expect(body).toContain('Other Staff Client');
      expect(body).toContain('Unassigned Client');
      expect(res.body.timeline).toHaveLength(3);
    });
  });
});
