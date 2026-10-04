import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * UAT-6 (M2 Slice 14): Reception sees no sales data. A company with a won
 * deal, a sent offer and a follow-up exists; Reception, who holds only the M1
 * company permissions, is refused every Milestone 2 route and finds nothing
 * of the deal, its price or its events on the company it can open (FR-RBAC-17,
 * NFR-SEC-04).
 */
describe('UAT-6 Reception sees no sales data (M2 Slice 14)', () => {
  const tenantId = `t-uat6-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-wl-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB'), manager: uid('manager'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
    };
  };
  const company = randomUUID();
  const otherCompany = randomUUID();

  const newDeal = async (clientId = company, who: Who = 'salesA') =>
    (await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' }).expect(201)).body.data.id as string;

  /** A priced draft offer for the deal (Example A: 49.40 a month, 592.80 a year). */
  const draftOffer = async (dealId: string) => {
    const pick = async (model: 'businessType' | 'priceZone' | 'visitFrequency', nameSq: string) =>
      ((await (prisma as any)[model].findFirstOrThrow({ where: { tenantId, nameSq } })) as { id: string }).id;
    const res = await as('salesA')
      .put(`/deals/${dealId}/offer`, {
        employees: 2,
        businessTypeId: await pick('businessType', 'Restorant'),
        zoneId: await pick('priceZone', 'Tirana qendër'),
        frequencyId: await pick('visitFrequency', '2 herë në vit'),
        packageId: (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id,
      })
      .expect(res => expect([200, 201]).toContain(res.status));
    return res.body.data.id as string;
  };
  const readyOffer = async (dealId: string) => {
    const id = await draftOffer(dealId);
    await as('salesA').post(`/offers/${id}/mark-ready`, {}).expect(200);
    return id;
  };
  const sentOffer = async (dealId: string) => {
    const id = await readyOffer(dealId);
    await as('salesA').post(`/offers/${id}/mark-sent`, { sentDate: today() }).expect(200);
    return id;
  };
  const dealAudits = (dealId: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Deal', entityId: dealId } });
  const statusOf = async () => (await prisma.client.findFirstOrThrow({ where: { id: company } })).status;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'UAT-6', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);
    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
    const restaurant = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Restorant' } })).id;
    const tirane = (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })).id;
    const row = (id: string, name: string, assignedUserId: string) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
      employeeCount: 2, businessTypeId: restaurant, cityId: tirane, status: 'PROSPECT',
    });
    await prisma.client.createMany({ data: [row(company, 'Restorant Tirana', users.salesA), row(otherCompany, 'Restorant B', users.salesB)] });
  }, 30_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  let dealId: string;
  let offerId: string;

  beforeAll(async () => {
    dealId = await newDeal();
    offerId = await sentOffer(dealId);
    await as('salesA').post('/follow-ups', { clientId: company, dealId, intervalDays: 3 }).expect(201);
    await as('salesA').post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
  }, 30_000);

  it('UAT-6 the sales user sees the money, so the checks below prove something', async () => {
    const deal = await as('salesA').get(`/deals/${dealId}`).expect(200);
    expect(JSON.stringify(deal.body)).toContain('49.40');
  });

  it('UAT-6 every Milestone 2 route refuses Reception', async () => {
    const reads = [
      '/deals', '/deals/board', `/deals/${dealId}`, `/deals/${dealId}/offers`, `/deals/${dealId}/activities`,
      '/offers', `/offers/${offerId}/pdf`, '/follow-ups/mine', '/follow-ups/overdue-count', '/pricing/config', '/sales-script',
      '/discount-approvals/pending', '/calendar?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z',
    ];
    for (const path of reads) {
      const res = await as('reception').get(path);
      expect([path, res.status]).toEqual([path, 403]);
    }
    expect((await as('reception').post('/pricing/calculate', { dealId })).status).toBe(403);
    expect((await as('reception').post(`/deals/${dealId}/win`, { offerId })).status).toBe(403);
    expect((await as('reception').post('/deals', { clientId: company, type: 'NEW_CONTRACT' })).status).toBe(403);
  });

  it('UAT-6 the company Reception can open shows no deal, price or sales event', async () => {
    const detail = await as('reception').get(`/clients/${company}`).expect(200);
    expectNoCommercialFields(detail.body);
    const history = await as('reception').get(`/clients/${company}/history`).expect(200);
    expectNoCommercialFields(history.body);
    const text = JSON.stringify(history.body);
    expect(text).not.toMatch(/DEAL_|OFFER|FOLLOW_UP/);
    expect(text).not.toContain('49.40');
    expect(JSON.stringify(detail.body)).not.toContain('49.40');
  });
});
