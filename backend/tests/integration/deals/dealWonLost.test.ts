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
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * M2 Slice 13 end to end: winning a deal from its offer, losing it with a
 * reason, reopening it, the audit trail and the company history. The
 * "UAT-1" and "UAT-2" scenarios run the SRS acceptance paths on a seeded
 * workspace for the hardening report.
 */
describe('Won and lost (M2 Slice 13)', () => {
  const tenantId = `t-wonlost-${randomUUID()}`;
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
  let reasonId: string;

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
    await prisma.tenant.create({ data: { id: tenantId, name: 'Won lost', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);
    reasonId = (await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } })).id;
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

  it('FR-DEAL-14 wins from a sent offer: the agreed values come from the offer, which becomes Accepted', async () => {
    const dealId = await newDeal();
    const offerId = await sentOffer(dealId);
    const res = await as('salesA').post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
    expect(res.body.data).toMatchObject({
      stage: 'WON', agreedMonthlyPrice: '49.40', agreedAnnualValue: '592.80', wonQuotationId: offerId, wonAt: expect.any(String),
    });
    expect(res.body.data.packageId).toBeTruthy();
    expect((await prisma.quotation.findFirstOrThrow({ where: { id: offerId } })).status).toBe('ACCEPTED');
  });

  it('FR-DEAL-14 the price cannot be passed in, and a draft offer cannot win', async () => {
    const dealId = await newDeal();
    const draft = await draftOffer(dealId);
    await as('salesA').post(`/deals/${dealId}/win`, { offerId: draft, agreedMonthlyPrice: '1.00', closeFollowUps: false }).expect(400);
    await as('salesA').post(`/deals/${dealId}/win`, { offerId: draft, closeFollowUps: false }).expect(409);
    expect((await prisma.deal.findFirstOrThrow({ where: { id: dealId } })).stageKey).not.toBe('WON');
  });

  it('FR-DEAL-15 winning makes the company a Client and closes the deal\'s open follow-ups when confirmed', async () => {
    // A company of its own, since earlier wins made the shared one a Client.
    const fresh = randomUUID();
    const base = await prisma.client.findFirstOrThrow({ where: { id: company } });
    await prisma.client.create({ data: { ...base, id: fresh, name: 'Fresh prospect', status: 'PROSPECT', customFieldValues: {} } });
    const dealId = await newDeal(fresh);
    const offerId = await readyOffer(dealId);
    await as('salesA').post('/follow-ups', { clientId: fresh, dealId, intervalDays: 3 }).expect(201);
    const statusOfFresh = async () => (await prisma.client.findFirstOrThrow({ where: { id: fresh } })).status;
    expect(await statusOfFresh()).toBe('PROSPECT');
    await as('salesA').post(`/deals/${dealId}/win`, { offerId, closeFollowUps: true }).expect(200);
    expect(await statusOfFresh()).toBe('CLIENT');
    expect(await prisma.appointment.count({ where: { dealId, kind: 'FOLLOW_UP', status: { in: ['SCHEDULED', 'CONFIRMED'] } } })).toBe(0);
    const cancelled = await prisma.appointment.findFirstOrThrow({ where: { dealId, kind: 'FOLLOW_UP' } });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Deal won' });
  });

  it('FR-DEAL-15 keeps the follow-ups open when the salesperson did not confirm', async () => {
    const dealId = await newDeal();
    const offerId = await readyOffer(dealId);
    await as('salesA').post('/follow-ups', { clientId: company, dealId, intervalDays: 3 }).expect(201);
    await as('salesA').post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
    expect(await prisma.appointment.count({ where: { dealId, status: 'SCHEDULED' } })).toBe(1);
  });

  it('FR-DEAL-16 losing needs an active reason, rejects the open offers and closes the follow-ups', async () => {
    const dealId = await newDeal();
    const offerId = await sentOffer(dealId);
    await as('salesA').post('/follow-ups', { clientId: company, dealId, intervalDays: 3 }).expect(201);
    await as('salesA').post(`/deals/${dealId}/lose`, { note: 'x' }).expect(400);
    await as('salesA').post(`/deals/${dealId}/lose`, { reasonId: 'nope' }).expect(400);
    const res = await as('salesA').post(`/deals/${dealId}/lose`, { reasonId, note: 'Went with a competitor' }).expect(200);
    expect(res.body.data).toMatchObject({ stage: 'LOST', lostReasonId: reasonId, lostNote: 'Went with a competitor' });
    expect(res.body.data.lostReasonSq).toBeTruthy();
    expect((await prisma.quotation.findFirstOrThrow({ where: { id: offerId } })).status).toBe('REJECTED');
    expect(await prisma.appointment.count({ where: { dealId, status: 'SCHEDULED' } })).toBe(0);
    const timeline = (await as('salesA').get(`/clients/${company}/history?type=DEAL`).expect(200)).body.timeline;
    expect(timeline.find((e: any) => e.type === 'DEAL_LOST' && e.details.dealId === dealId).details.lostNote).toBe('Went with a competitor');
  });

  it('FR-DEAL-17 a Sales Manager reopens a lost deal to Negotiation, recording who; a Sales User cannot', async () => {
    const dealId = await newDeal();
    await as('salesA').post(`/deals/${dealId}/lose`, { reasonId }).expect(200);
    await as('salesA').post(`/deals/${dealId}/reopen`, { stage: 'NEGOTIATION', comment: 'Back on' }).expect(403);
    await as('manager').post(`/deals/${dealId}/reopen`, { stage: 'NEGOTIATION', comment: ' ' }).expect(400);
    const res = await as('manager').post(`/deals/${dealId}/reopen`, { stage: 'NEGOTIATION', comment: 'Customer called back' }).expect(200);
    expect(res.body.data).toMatchObject({ stage: 'NEGOTIATION', lostReasonId: null, closedAt: null });
    const row = await prisma.dealStageHistory.findFirstOrThrow({ where: { dealId, fromStage: 'LOST' } });
    expect(row).toMatchObject({ toStage: 'NEGOTIATION', changedByUserId: users.manager });
    expect(row.note).toContain('Customer called back');
  });

  it('FR-DEAL-18 win, lose and reopen each create an audit entry', async () => {
    const won = await newDeal();
    await as('salesA').post(`/deals/${won}/win`, { offerId: await readyOffer(won), closeFollowUps: false }).expect(200);
    const lost = await newDeal();
    await as('salesA').post(`/deals/${lost}/lose`, { reasonId }).expect(200);
    await as('manager').post(`/deals/${lost}/reopen`, { stage: 'CONTACTED', comment: 'again' }).expect(200);
    const wonAudit = (await dealAudits(won)).find((entry) => entry.action === 'STATUS_CHANGE')!;
    expect(JSON.stringify(wonAudit.changes)).toContain('agreedMonthlyPrice');
    expect((await dealAudits(lost)).filter((entry) => entry.action === 'STATUS_CHANGE')).toHaveLength(2);
    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'Client', entityId: company, action: 'UPDATE' } })).toBeGreaterThan(0);
  });

  it('FR-OFR-12 accepting a sent offer returns canWinDeal', async () => {
    const dealId = await newDeal();
    const offerId = await sentOffer(dealId);
    const res = await as('salesA').post(`/offers/${offerId}/mark-accepted`, {}).expect(200);
    expect(res.body.data.canWinDeal).toBe(true);
    const win = await as('salesA').post(`/deals/${dealId}/win`, { closeFollowUps: false }).expect(200);
    expect(win.body.data.wonQuotationId).toBe(offerId);
  });

  it('FR-DEAL-20 the company timeline shows "Deal won", and Reception sees nothing of it', async () => {
    const dealId = await newDeal();
    await as('salesA').post(`/deals/${dealId}/win`, { offerId: await readyOffer(dealId), closeFollowUps: false }).expect(200);
    const timeline = (await as('salesA').get(`/clients/${company}/history?type=DEAL`).expect(200)).body.timeline;
    const mine = timeline.filter((e: any) => e.details.dealId === dealId).map((e: any) => e.type);
    expect(mine).toContain('DEAL_WON');
    expect(mine).not.toContain('DEAL_STAGE_CHANGED_TO_WON');
    expect(JSON.stringify((await as('reception').get(`/clients/${company}/history`)).body)).not.toContain('DEAL_WON');
  });

  it('FR-DEAL-04 a deal outside the scope is not found, and a closed deal cannot be won again', async () => {
    const dealId = await newDeal(otherCompany, 'salesB');
    await as('salesA').post(`/deals/${dealId}/lose`, { reasonId }).expect(404);
    await as('salesB').post(`/deals/${dealId}/lose`, { reasonId }).expect(200);
    await as('salesB').post(`/deals/${dealId}/win`, { closeFollowUps: false }).expect(409);
  });

  it('UAT-1 a new restaurant: deal, priced offer, sent, accepted, won — the company is a Client at 49.40 a month', async () => {
    const dealId = await newDeal();
    const offerId = await sentOffer(dealId);
    await as('salesA').post(`/offers/${offerId}/mark-accepted`, {}).expect(200);
    const res = await as('salesA').post(`/deals/${dealId}/win`, { closeFollowUps: true, closingDate: today() }).expect(200);
    expect(res.body.data).toMatchObject({ stage: 'WON', agreedMonthlyPrice: '49.40', agreedAnnualValue: '592.80' });
    expect(await statusOf()).toBe('CLIENT');
  });

  it('UAT-2 a second deal is lost with a reason, then reopened by the manager and won', async () => {
    const dealId = await newDeal();
    const offerId = await sentOffer(dealId);
    await as('salesA').post(`/deals/${dealId}/lose`, { reasonId, note: 'Too early' }).expect(200);
    expect((await prisma.quotation.findFirstOrThrow({ where: { id: offerId } })).status).toBe('REJECTED');
    await as('manager').post(`/deals/${dealId}/reopen`, { stage: 'NEGOTIATION', comment: 'They are ready now' }).expect(200);
    const fresh = await readyOffer(dealId);
    const res = await as('salesA').post(`/deals/${dealId}/win`, { offerId: fresh, closeFollowUps: false }).expect(200);
    expect(res.body.data.stage).toBe('WON');
  });
});
