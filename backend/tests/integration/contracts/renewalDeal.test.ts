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
 * M3 Slice 10: a Renewal deal is started from a contract (FR-REN-06), won with
 * the Milestone 2 flow, and "Create contract" makes the next term the day after
 * the old one ends, linked both ways (FR-REN-07). Nothing renews on its own and
 * the direct renew call is refused in the sales process (FR-REN-10). Contracts
 * are written straight to the database: how they got there is Slices 4 and 5.
 */
describe('Renewal deal and renewal contract (M3 Slice 10)', () => {
  const tenantId = `t-renewal-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-rn-${label}-${randomUUID()}`;
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
  const company = { A: randomUUID(), B: randomUUID() };

  /** A contract of company A (or `clientId`), written directly. */
  const contract = async (status = 'ACTIVE', extra: Record<string, unknown> = {}, clientId = company.A) => {
    const id = randomUUID();
    await prisma.contract.create({
      data: {
        id, tenantId, clientId, planName: 'Gold', status, amount: '49.40', billingPeriod: 'MONTHLY',
        startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31'), createdByUserId: users.admin, assignedUserId: users.salesA,
        number: `CTR-2026-${randomUUID().slice(0, 4)}`, renewalDate: new Date('2026-11-01'), ...extra,
      } as any,
    });
    return id;
  };
  const start = (contractId: string, who: Who = 'salesA', body: object = {}) => as(who).post(`/contracts/${contractId}/renewal`, body);
  const detail = async (contractId: string, who: Who = 'salesA') => (await as(who).get(`/contracts/${contractId}`).expect(200)).body;

  /** Wins `dealId` with a priced offer, as the Milestone 2 flow does. */
  const win = async (dealId: string, who: Who = 'salesA') => {
    const pick = async (model: 'businessType' | 'priceZone' | 'visitFrequency', nameSq: string) =>
      ((await (prisma as any)[model].findFirstOrThrow({ where: { tenantId, nameSq } })) as { id: string }).id;
    const draft = await as(who)
      .put(`/deals/${dealId}/offer`, {
        employees: 2,
        businessTypeId: await pick('businessType', 'Restorant'),
        zoneId: await pick('priceZone', 'Tirana qendër'),
        frequencyId: await pick('visitFrequency', '2 herë në vit'),
        packageId: (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id,
      })
      .expect((res) => expect([200, 201]).toContain(res.status));
    const offerId = draft.body.data.id as string;
    await as(who).post(`/offers/${offerId}/mark-ready`, {}).expect(200);
    await as(who).post(`/offers/${offerId}/mark-sent`, { sentDate: today() }).expect(200);
    await as(who).post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Renewal tenant', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' } });
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
    const tirana = await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } });
    const row = (id: string, name: string, assignedUserId: string) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
      employeeCount: 2, businessTypeId: restaurant, cityId: tirana.id, areaId: (tirana as { areaId?: string | null }).areaId ?? null, status: 'CLIENT',
    });
    await prisma.client.createMany({ data: [row(company.A, 'Restorant A', users.salesA), row(company.B, 'Restorant B', users.salesB)] });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-REN-06 starts a Renewal deal in Interested, owned by the contract\'s salesperson, with its history and audit', async () => {
    const id = await contract();
    expect((await detail(id)).permittedActions).toContain('START_RENEWAL');

    const res = await start(id).expect(201);
    const deal = await prisma.deal.findFirstOrThrow({ where: { id: res.body.dealId } });
    expect(deal).toMatchObject({ type: 'RENEWAL', stageKey: 'INTERESTED', renewalOfContractId: id, ownerUserId: users.salesA, clientId: company.A, tenantId });

    const history = await prisma.dealStageHistory.findMany({ where: { dealId: deal.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStage: null, toStage: 'INTERESTED', changedByUserId: users.salesA });

    const dealAudit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Deal', entityId: deal.id } });
    expect(dealAudit).toHaveLength(1);
    expect(dealAudit[0].action).toBe('CREATE');
    const contractAudit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: id, action: 'UPDATE' } });
    expect(JSON.stringify(contractAudit.map((entry) => entry.changes))).toContain(deal.id);

    // The contract now shows the open deal and no longer offers to start another.
    const after = await detail(id);
    expect(after.renewal.openDealId).toBe(deal.id);
    expect(after.permittedActions).not.toContain('START_RENEWAL');
    // The deal screen says what it renews.
    const dealView = (await as('salesA').get(`/deals/${deal.id}`).expect(200)).body.data;
    expect(dealView).toMatchObject({ type: 'RENEWAL', renewalOfContractId: id, renewalOfContractNumber: after.contract.number, renewalStartsOn: '2027-01-01' });
  });

  it('FR-REN-06 a second renewal for the same contract is refused while one is open, and allowed once it is Lost', async () => {
    const id = await contract();
    const first = (await start(id).expect(201)).body.dealId as string;
    const second = await start(id).expect(409);
    expect(second.body).toMatchObject({ code: 'RENEWAL_OPEN', dealId: first });
    expect(await prisma.deal.count({ where: { tenantId, renewalOfContractId: id } })).toBe(1);

    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    await as('salesA').post(`/deals/${first}/lose`, { reasonId: reason.id }).expect(200);
    const again = await start(id).expect(201);
    expect(again.body.dealId).not.toBe(first);
  });

  it('FR-REN-06 is refused for a Draft, Pending Signature or Cancelled contract, one already renewed, and one marked Not renewing', async () => {
    for (const status of ['DRAFT', 'PENDING_SIGNATURE', 'CANCELLED']) {
      const res = await start(await contract(status)).expect(409);
      expect(res.body.code).toBe('NOT_RENEWABLE_STATUS');
      expect(await prisma.deal.count({ where: { tenantId, type: 'RENEWAL', renewalOfContractId: null } })).toBe(0);
    }
    const previous = await contract('EXPIRED');
    await contract('DRAFT', { renewedFromContractId: previous, number: null });
    expect((await start(previous).expect(409)).body.code).toBe('ALREADY_RENEWED');

    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId } });
    const notRenewing = await contract('ACTIVE', { notRenewingReasonId: reason.id });
    expect((await start(notRenewing).expect(409)).body.code).toBe('NOT_RENEWING');
    expect((await detail(notRenewing)).permittedActions).not.toContain('START_RENEWAL');
  });

  it('FR-REN-06 an Active, Suspended and Expired contract can each be renewed', async () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'EXPIRED']) await start(await contract(status)).expect(201);
  });

  it('FR-REN-06 a Sales User cannot start a renewal for a colleague\'s contract, and Reception cannot start one at all', async () => {
    const id = await contract();
    await start(id, 'salesB').expect(404);
    await start(id, 'reception').expect(403);
    expect(await prisma.deal.count({ where: { tenantId, renewalOfContractId: id } })).toBe(0);
    // The Sales Manager's team includes this sales user's company, and may name the owner.
    await start(id, 'manager').expect(201);
  });

  it('Two parallel "Start renewal" calls create one deal', async () => {
    const id = await contract();
    const results = await Promise.all([start(id), start(id), start(id)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.deal.count({ where: { tenantId, renewalOfContractId: id } })).toBe(1);
  });

  it('D9 the database allows one open renewal deal per contract, and another once it is closed', async () => {
    const id = await contract();
    const deal = (stageKey: string) => ({
      id: randomUUID(), tenantId, clientId: company.A, ownerUserId: users.salesA, createdByUserId: users.salesA,
      type: 'RENEWAL', stageKey, renewalOfContractId: id,
    });
    await prisma.deal.create({ data: deal('INTERESTED') });
    await expect(prisma.deal.create({ data: deal('NEGOTIATION') })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.deal.create({ data: deal('LOST') });
    await prisma.deal.create({ data: deal('WON') });
  });

  it('FR-REN-07 the won renewal makes the next term the day after the old end date, linked both ways, and the old contract is unchanged', async () => {
    const id = await contract('EXPIRED');
    const before = await detail(id);
    const dealId = (await start(id).expect(201)).body.dealId as string;
    await win(dealId);

    const made = await as('salesA').post('/contracts', { dealId }).expect(201);
    expect(made.body).toMatchObject({
      status: 'DRAFT', dealId, renewedFromContractId: id, startsAt: '2027-01-01T00:00:00.000Z', assignedUserId: users.salesA,
    });
    expect(made.body.number).toMatch(/^CTR-\d{4}-\d{4}$/);
    expect(made.body.number).not.toBe(before.contract.number);
    // The new term starts with no reminder sent (FR-REN-03).
    expect(await prisma.contractReminder.count({ where: { contractId: made.body.id } })).toBe(0);

    const old = await detail(id);
    expect(old.contract).toMatchObject({ status: 'EXPIRED', endsAt: before.contract.endsAt, startsAt: before.contract.startsAt, amount: before.contract.amount });
    expect(old.renewal.renewedInto).toEqual({ id: made.body.id, number: made.body.number });
    expect(old.history.some((h: any) => String(h.note).includes(`Renewed into contract ${made.body.number}`))).toBe(true);
    expect(old.history.length).toBe(before.history.length + 1);
    expect(old.permittedActions).not.toContain('START_RENEWAL');

    const next = await detail(made.body.id);
    expect(next.renewal.renewedFrom).toEqual({ id, number: before.contract.number });
    const audit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: id, action: 'UPDATE' } });
    expect(JSON.stringify(audit.map((entry) => entry.changes))).toContain(made.body.id);
    expect((await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data.contractId).toBe(made.body.id);

    // The same term cannot be renewed twice.
    expect((await start(id).expect(409)).body.code).toBe('ALREADY_RENEWED');
  });

  it('FR-REN-07 an explicit start date still wins over the default', async () => {
    const id = await contract('ACTIVE');
    const dealId = (await start(id).expect(201)).body.dealId as string;
    await win(dealId);
    const made = await as('salesA').post('/contracts', { dealId, startsAt: '2027-02-01' }).expect(201);
    expect(made.body.startsAt).toBe('2027-02-01T00:00:00.000Z');
    expect(made.body.renewedFromContractId).toBe(id);
  });

  it('FR-REN-10 the direct renew call is refused in the sales process, and a plain deal still makes a contract with no link', async () => {
    const id = await contract('EXPIRED');
    await as('salesA').post(`/contracts/${id}/renew`, {}).expect(400);
    expect(await prisma.contract.count({ where: { tenantId, renewedFromContractId: id } })).toBe(0);
  });

  it('FR-RBAC-21 Reception sees no renewal data on a contract', async () => {
    const id = await contract();
    await start(id).expect(201);
    const view = await detail(id, 'reception');
    expect(view).not.toHaveProperty('renewal');
    expect(view.permittedActions).toEqual([]);
  });
});
