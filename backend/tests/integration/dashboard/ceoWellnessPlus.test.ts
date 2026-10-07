import request from 'supertest';
import express from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const MARCH = { preset: 'CUSTOM', from: '2025-03-01', to: '2025-03-31' };
const APRIL = { preset: 'CUSTOM', from: '2025-04-01', to: '2025-04-30' };

/**
 * M4 Slice 15: the CEO dashboard's Wellness+ block (FR-DSH-14, 15, 16, FR-RBAC-29, FR-RBAC-27, NFR-ACC-06).
 * The block calls the reports page's use case, so the tests compare it with the reports endpoint.
 */
describe('CEO dashboard Wellness+ block (M4 Slice 15)', () => {
  const tenantId = `t-wp-ceo-${randomUUID()}`;
  const uid = (label: string) => `u-wpc-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), manager: uid('manager'), sales: uid('sales'), reception: uid('reception'), noReports: uid('noreports'), noMoney: uid('nomoney') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => ({
    get: (path: string, query: Record<string, string> = {}) => request(app).get(`/api/${tenantId}${path}`).query(query).set('Authorization', `Bearer ${tokens[who]}`),
    post: (path: string, body: object = {}) => request(app).post(`/api/${tenantId}${path}`).send(body).set('Authorization', `Bearer ${tokens[who]}`),
    patch: (path: string, body: object = {}) => request(app).patch(`/api/${tenantId}${path}`).send(body).set('Authorization', `Bearer ${tokens[who]}`),
  });
  const figure = (body: any, key: string) => body.wellnessPlus.figures.find((f: any) => f.key === key);

  let counter = 0;
  const member = async (tier: string, extra: Record<string, unknown> = {}) => {
    counter += 1;
    const id = randomUUID();
    await prisma.member.create({
      data: {
        id, tenantId, memberNumber: `WP-C${String(counter).padStart(5, '0')}`, firstName: 'Ceo', lastName: `Holder${counter}`, email: `ceo${counter}@example.com`, phone: `+3556${String(counter).padStart(7, '0')}`,
        currentTier: tier, startsOn: asDate('2025-01-01'), cardToken: randomBytes(32).toString('base64url'), createdBy: users.admin, ...extra,
      } as any,
    });
    return id;
  };
  let receipts = 0;
  const payment = async (memberId: string, p: { kind: string; fromTier: string; toTier: string; amount: string; receivedOn: string }) => {
    receipts += 1;
    return prisma.memberPayment.create({
      data: {
        id: randomUUID(), tenantId, memberId, kind: p.kind, fromTier: p.fromTier, toTier: p.toTier, listFee: p.amount, discountPercent: 0, amount: p.amount, method: 'CASH',
        receivedOn: asDate(p.receivedOn), receiptNumber: `RCP-C-${receipts}`, recordedBy: users.admin,
      },
    });
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness CEO Block', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    // CEO-based roles without Wellness+ reports, and with reports but without payments (FR-DSH-15, FR-DSH-16).
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Ceo, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const noReportsRole = await customRole(['performance.view', 'members.view', 'members.payments.view']);
    const noMoneyRole = await customRole(['performance.view', 'members.reports.view']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cela'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Rea'),
        user(users.noReports, noReportsRole, 'Nora'),
        user(users.noMoney, noMoneyRole, 'Mira'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);

    // March: 3 new Silver (EUR 60.00) and 2 Silver to Gold upgrades (EUR 40.00). April: one new Silver.
    for (let i = 0; i < 3; i += 1) await payment(await member('SILVER'), { kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', amount: '60.00', receivedOn: `2025-03-0${i + 2}` });
    for (let i = 0; i < 2; i += 1) await payment(await member('GOLD'), { kind: 'UPGRADE', fromTier: 'SILVER', toTier: 'GOLD', amount: '40.00', receivedOn: `2025-03-1${i}` });
    await payment(await member('SILVER'), { kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', amount: '60.00', receivedOn: '2025-04-03' });
    await member('BRONZE');
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  const dashboard = async (who: Who, period: Record<string, string>) => (await as(who).get('/dashboard/ceo', period).expect(200)).body;
  const report = async (who: Who, period: Record<string, string>) => (await as(who).get('/membership/reports', period).expect(200)).body.data;

  it('FR-DSH-14 / NFR-ACC-06: every figure equals the same figure on the reports page for All', async () => {
    const [ceo, rpt] = await Promise.all([dashboard('ceo', MARCH), report('ceo', MARCH)]);
    const expected: Record<string, unknown> = {
      membersActive: rpt.active.total,
      membersCorporate: rpt.segments.corporate.count,
      membersIndividual: rpt.segments.individual.count,
      membersNew: rpt.newMembers.total,
      membershipsNewPaid: rpt.newMembers.newPaidMemberships,
      membershipUpgrades: rpt.upgrades.count,
      membershipDowngrades: rpt.downgrades.total,
      membershipRenewalRate: rpt.renewals.rate === null ? null : Number(rpt.renewals.rate),
      membershipsExpiring: rpt.lists.expiring.length,
      membershipRevenue: rpt.revenue.total,
    };
    for (const [key, value] of Object.entries(expected)) expect([key, figure(ceo, key).value]).toEqual([key, value]);
    expect(ceo.wellnessPlus.charts.activePerTier.map((p: any) => [p.key, p.count])).toEqual(rpt.active.perTier.map((r: any) => [r.tier, r.count]));
    expect(ceo.wellnessPlus.tables.renewalsPerTier).toEqual(rpt.renewals.perTier);
    // The seeded figures themselves: 3 new paid memberships, 2 upgrades, EUR 260.00.
    expect(figure(ceo, 'membershipsNewPaid').value).toBe(3);
    expect(figure(ceo, 'membershipUpgrades').value).toBe(2);
    expect(figure(ceo, 'membershipRevenue').value).toBe('260.00');
  });

  it('FR-DSH-15: changing the period changes the period figures and not "as of now" figures', async () => {
    const [march, april] = await Promise.all([dashboard('ceo', MARCH), dashboard('ceo', APRIL)]);
    expect(figure(march, 'membershipUpgrades').value).toBe(2);
    expect(figure(april, 'membershipUpgrades').value).toBe(0);
    expect(figure(march, 'membershipUpgrades').basis).toBe('period');
    expect(figure(march, 'membersActive').basis).toBe('asOfNow');
    expect(figure(april, 'membersActive').value).toBe(figure(march, 'membersActive').value);
    expect(figure(april, 'membershipsNewPaid').value).toBe(1);
  });

  it('FR-DSH-15: each figure links to the report section already filtered', async () => {
    const ceo = await dashboard('ceo', MARCH);
    expect(figure(ceo, 'membershipUpgrades').link).toEqual({
      target: 'MEMBERSHIP_REPORTS',
      filters: { section: 'upgrades', preset: 'CUSTOM', from: '2025-03-01', to: '2025-03-31' },
    });
    expect(figure(ceo, 'membersCorporate').link).toEqual({ target: 'MEMBERSHIP_REPORTS', filters: { section: 'segments', segment: 'CORPORATE' } });
  });

  it('FR-DSH-15 / FR-RBAC-27: without Members: view payments the revenue is absent, not zero', async () => {
    const body = await dashboard('noMoney', MARCH);
    expect(figure(body, 'membershipRevenue')).toBeUndefined();
    expect(figure(body, 'membershipUpgrades').value).toBe(2);
    expect(JSON.stringify(body.wellnessPlus)).not.toMatch(/260\.00|revenue/i);
  });

  it('FR-DSH-16: without Members: view reports the key and every Wellness+ field are absent', async () => {
    const body = await dashboard('noReports', MARCH);
    expect('wellnessPlus' in body).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/membersActive|membershipUpgrades|membershipRevenue/);
  });

  it('FR-DSH-16: the Sales, Manager, Administrator and Reception dashboards carry no Wellness+ key', async () => {
    for (const [who, path] of [['manager', '/dashboard/sales-manager'], ['sales', '/dashboard/sales-user'], ['admin', '/dashboard/administrator']] as Array<[Who, string]>) {
      const res = await as(who).get(path, MARCH);
      if (res.status === 200) expect('wellnessPlus' in res.body).toBe(false);
    }
    await as('reception').get('/dashboard/ceo', MARCH).expect(403);
  });

  it('FR-RBAC-29: the CEO gets 403 on every member, payment, import and settings write', async () => {
    const id = randomUUID();
    await as('ceo').post('/membership/members', { firstName: 'A', lastName: 'B' }).expect(403);
    await as('ceo').patch(`/membership/members/${id}`, { firstName: 'A' }).expect(403);
    await as('ceo').post(`/membership/members/${id}/payments`, {}).expect(403);
    await as('ceo').post(`/membership/payments/${id}/void`, { reason: 'x' }).expect(403);
    await as('ceo').post(`/membership/members/${id}/correct-tier`, {}).expect(403);
    await as('ceo').patch('/membership/settings', { graceDays: 5 }).expect(403);
    await as('ceo').post('/membership/employee-imports', {}).expect(403);
  });
});
