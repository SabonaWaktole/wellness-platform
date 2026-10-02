import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { DEFAULT_ACTIVITY_RESULTS } from '../../../src/lookups/domain/DefaultLookups';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

/**
 * M2 Slice 7 end to end (FR-ACT-01, 02, 03, 05, 06, 07, FR-DEAL-08): calls,
 * emails, visits, meetings, online meetings and notes with when they
 * happened, the contact, a result and the next action, linked to a deal, on
 * the company timeline and on the deal page.
 */
describe('Activities (M2 Slice 7)', () => {
  const tenantId = `t-activities-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-act-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    reception: uid('reception'),
    clerk: uid('clerk'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens: Record<Who, string> = {} as any;

  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  /** Owned by Sales User A and Sales User B, each with one contact. */
  const companies = { a: randomUUID(), b: randomUUID() };
  const contacts = { a: randomUUID(), b: randomUUID() };
  let resultId: string;

  const record = (who: Who, clientId: string, body: object) => as(who).post(`/clients/${clientId}/interactions`, body);
  const call = (overrides: object = {}) => ({
    channel: 'CALL',
    content: 'Called the office manager',
    contactPersonId: contacts.a,
    resultId,
    clientFeedback: 'Interested, wants a price for two employees',
    nextAction: 'Send the offer',
    ...overrides,
  });
  const newDeal = async (clientId = companies.a, who: Who = 'salesA') => {
    const res = await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };
  const timeline = async (who: Who, clientId = companies.a) =>
    (await as(who).get(`/clients/${clientId}/history?limit=100`).expect(200)).body.timeline as any[];

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Activities tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    resultId = (await prisma.activityResult.findFirstOrThrow({ where: { tenantId, nameEn: 'Reached – interested' } })).id;

    // A hand-built role that holds only the activity results key (SRS §9.2).
    const clerkRole = `r-act-clerk-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: clerkRole, tenantId, key: `clerk-${randomUUID()}`, nameSq: 'Listat', nameEn: 'Lists', isSystem: false, baseKey: RoleKey.SalesUser,
        permissions: { create: [{ permissionKey: 'activityResults.manage', scope: null }] },
      },
    });

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
        user(users.clerk, clerkRole, 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    const company = (id: string, name: string, assignedUserId: string) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
    });
    await prisma.client.createMany({ data: [company(companies.a, 'Kafe Blloku', users.salesA), company(companies.b, 'Furra Dritan', users.salesB)] });
    await prisma.contactPerson.createMany({
      data: [
        { id: contacts.a, tenantId, clientId: companies.a, name: 'Elira Hoxha', phone: '+355691111111', isPrimary: true },
        { id: contacts.b, tenantId, clientId: companies.b, name: 'Arben Leka', phone: '+355692222222', isPrimary: true },
      ],
    });
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('recording (FR-ACT-01, 02)', () => {
    it('FR-ACT-01 each of the six types can be recorded, Visit and Online meeting included', async () => {
      for (const channel of ['CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING']) {
        const res = await record('salesA', companies.a, call({ channel }));
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ channel, contactPersonId: contacts.a, resultId, authorUserId: users.salesA });
      }
      const note = await record('salesA', companies.a, { channel: 'NOTE', content: 'Prefers mornings' });
      expect(note.status).toBe(201);
      expect(note.body).toMatchObject({ channel: 'NOTE', contactPersonId: null, resultId: null });
    });

    it('FR-ACT-01 an activity links to an open deal of the same company only', async () => {
      const dealId = await newDeal();
      expect((await record('salesA', companies.a, call({ dealId }))).status).toBe(201);

      const otherCompanyDeal = await newDeal(companies.b, 'salesB');
      const wrongCompany = await record('manager', companies.a, call({ dealId: otherCompanyDeal }));
      expect(wrongCompany.status).toBe(400);
      expect(wrongCompany.body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'dealId' });

      const won = await newDeal();
      await prisma.deal.update({ where: { id: won }, data: { stageKey: 'WON', closedAt: new Date(), wonAt: new Date() } });
      expect((await record('salesA', companies.a, call({ dealId: won }))).body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'dealId' });
    });

    it('FR-ACT-02 a call without a contact or a result gives a validation message on that field', async () => {
      const noContact = await record('salesA', companies.a, call({ contactPersonId: null }));
      expect(noContact.status).toBe(400);
      expect(noContact.body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'contactPersonId' });

      const noResult = await record('salesA', companies.a, call({ resultId: undefined }));
      expect(noResult.status).toBe(400);
      expect(noResult.body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'resultId' });

      const otherContact = await record('salesA', companies.a, call({ contactPersonId: contacts.b }));
      expect(otherContact.body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'contactPersonId' });
    });

    it('FR-ACT-02 the time may be in the past but not in the future', async () => {
      const yesterday = ago(24).toISOString();
      const past = await record('salesA', companies.a, call({ occurredAt: yesterday }));
      expect(past.status).toBe(201);
      expect(past.body.occurredAt).toBe(yesterday);

      const future = await record('salesA', companies.a, call({ occurredAt: new Date(Date.now() + 2 * HOUR).toISOString() }));
      expect(future.status).toBe(400);
      expect(future.body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'occurredAt' });
    });

    it("D3 a Sales User cannot record on another salesperson's company, and Reception records only notes", async () => {
      expect((await record('salesA', companies.b, call({ contactPersonId: contacts.b }))).status).toBe(404);
      expect((await record('reception', companies.a, call())).status).toBe(403);
      expect((await record('reception', companies.a, { channel: 'NOTE', content: 'Called the front desk' })).status).toBe(201);
    });
  });

  describe('activity results (FR-ACT-03)', () => {
    it('FR-ACT-03 the workspace starts with the six default results', async () => {
      const res = await as('salesA').get('/lookups/activity-results').expect(200);
      expect(res.body.data.map((item: any) => item.nameEn)).toEqual(DEFAULT_ACTIVITY_RESULTS.map((result) => result.nameEn));
    });

    it('FR-ACT-03 a new result is selectable immediately, and the write is audited', async () => {
      const created = await as('admin').post('/lookups/activity-results', { nameSq: 'Kërkoi vizitë', nameEn: 'Visit requested' });
      expect(created.status).toBe(201);
      const id = created.body.item.id;

      const listed = await as('salesA').get('/lookups/activity-results').expect(200);
      expect(listed.body.data.map((item: any) => item.id)).toContain(id);
      expect((await record('salesA', companies.a, call({ resultId: id }))).status).toBe(201);

      const audit = await prisma.auditEntry.findFirst({ where: { tenantId, entityType: 'ActivityResult', entityId: id, action: 'CREATE' } });
      expect(audit).toMatchObject({ userId: users.admin, entityLabel: 'Kërkoi vizitë' });
    });

    it('FR-ACT-03 a result in use cannot be deleted, and an inactive one cannot be chosen', async () => {
      const used = await as('admin').delete(`/lookups/activity-results/${resultId}`);
      expect(used.status).toBe(409);

      const spare = (await as('admin').post('/lookups/activity-results', { nameSq: 'I zënë', nameEn: 'Busy' })).body.item.id;
      await as('admin').post(`/lookups/activity-results/${spare}/deactivate`, {}).expect(200);
      expect((await record('salesA', companies.a, call({ resultId: spare }))).body).toMatchObject({ code: 'INVALID_ACTIVITY', field: 'resultId' });
    });

    it('FR-ACT-03 activityResults.manage alone manages this list and no other', async () => {
      expect((await as('clerk').post('/lookups/activity-results', { nameSq: 'Mesazh i lënë', nameEn: 'Left a message' })).status).toBe(201);
      expect((await as('clerk').post('/lookups/lost-reasons', { nameSq: 'Tjetër' })).status).toBe(403);
      expect((await as('salesA').post('/lookups/activity-results', { nameSq: 'Pa leje' })).status).toBe(403);
    });
  });

  describe('where activities show (FR-ACT-05)', () => {
    it('FR-ACT-05 a call appears on the company timeline and on the deal, newest first by when it happened', async () => {
      const dealId = await newDeal();
      const recent = (await record('salesA', companies.a, call({ dealId, nextAction: 'Visit on Monday' }))).body;
      // Typed in afterwards, but it happened two days ago: it sorts below.
      const backdated = (await record('salesA', companies.a, call({ dealId, channel: 'VISIT', occurredAt: ago(48).toISOString() }))).body;

      const onDeal = (await as('salesA').get(`/deals/${dealId}/activities`).expect(200)).body.data;
      expect(onDeal.map((activity: any) => activity.id)).toEqual([recent.id, backdated.id]);
      expect(onDeal[0]).toMatchObject({
        channel: 'CALL',
        author: { id: users.salesA, name: 'Besa Test' },
        contact: { id: contacts.a, name: 'Elira Hoxha' },
        result: { id: resultId, nameEn: 'Reached – interested' },
        nextAction: 'Visit on Monday',
      });

      const entries = await timeline('salesA');
      const ids = entries.map((entry) => entry.id);
      expect(ids.indexOf(`interaction:${recent.id}`)).toBeLessThan(ids.indexOf(`interaction:${backdated.id}`));
      const entry = entries.find((candidate) => candidate.id === `interaction:${recent.id}`);
      expect(entry).toMatchObject({
        category: 'ACTIVITY',
        timestamp: recent.occurredAt,
        actor: { id: users.salesA },
        details: { channel: 'CALL', contact: { name: 'Elira Hoxha' }, result: { nameSq: DEFAULT_ACTIVITY_RESULTS[0].nameSq }, nextAction: 'Visit on Monday', dealId },
      });
    });

    it("FR-ACT-05 the deal's activities follow the deal's scope, and Reception has no deal page", async () => {
      const dealId = await newDeal();
      await record('salesA', companies.a, call({ dealId }));
      expect((await as('salesB').get(`/deals/${dealId}/activities`)).status).toBe(404);
      expect((await as('manager').get(`/deals/${dealId}/activities`)).body.data).toHaveLength(1);
      expect((await as('reception').get(`/deals/${dealId}/activities`)).status).toBe(403);
    });
  });

  describe('editing (FR-ACT-06)', () => {
    const plant = async (authorUserId: string, recordedHoursAgo: number) => {
      const id = randomUUID();
      const at = ago(recordedHoursAgo);
      await prisma.interaction.create({
        data: { id, tenantId, clientId: companies.a, authorUserId, channel: 'CALL', content: 'Called', contactPersonId: contacts.a, resultId, createdAt: at, occurredAt: at },
      });
      return id;
    };
    const editOf = (id: string, who: Who, body: object = call({ nextAction: 'Edited' })) => as(who).patch(`/clients/${companies.a}/interactions/${id}`, body);

    it('FR-ACT-06 a Sales User edits their own activity within 24 hours', async () => {
      const id = await plant(users.salesA, 23);
      const res = await editOf(id, 'salesA');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nextAction: 'Edited', authorUserId: users.salesA, updatedByUserId: users.salesA });
      expect((await prisma.interaction.findUniqueOrThrow({ where: { id } })).updatedAt).not.toBeNull();
    });

    it('FR-ACT-06 a Sales User cannot edit their activity from two days ago; the Sales Manager can', async () => {
      const id = await plant(users.salesA, 48);
      const refused = await editOf(id, 'salesA');
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: 'ACTIVITY_EDIT_CLOSED' });

      const managed = await editOf(id, 'manager');
      expect(managed.status).toBe(200);
      expect(managed.body).toMatchObject({ authorUserId: users.salesA, updatedByUserId: users.manager, nextAction: 'Edited' });
    });

    it('FR-ACT-06 activities are never deleted: there is no delete route', async () => {
      const id = await plant(users.salesA, 1);
      expect((await as('admin').delete(`/clients/${companies.a}/interactions/${id}`)).status).toBe(404);
      expect(await prisma.interaction.count({ where: { id } })).toBe(1);
    });
  });

  describe('the deal moves on (FR-DEAL-08)', () => {
    const stageOf = async (dealId: string) => (await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data;

    it('FR-DEAL-08 the first call on a New Lead moves the deal to Contacted, recorded as automatic', async () => {
      const dealId = await newDeal();
      await record('salesA', companies.a, call({ dealId })).expect(201);

      const deal = await stageOf(dealId);
      expect(deal.stage).toBe('CONTACTED');
      expect(deal.history.at(-1)).toMatchObject({ fromStage: 'NEW_LEAD', toStage: 'CONTACTED', changedByUserId: null });
    });

    it('FR-DEAL-08 a note does not move the deal, and a deal in Negotiation stays there', async () => {
      const noted = await newDeal();
      await record('salesA', companies.a, { channel: 'NOTE', content: 'Owner on holiday', dealId: noted }).expect(201);
      expect((await stageOf(noted)).stage).toBe('NEW_LEAD');

      const negotiating = await newDeal();
      await as('salesA').post(`/deals/${negotiating}/stage`, { stage: 'NEGOTIATION' }).expect(200);
      await record('salesA', companies.a, call({ dealId: negotiating })).expect(201);
      expect((await stageOf(negotiating)).stage).toBe('NEGOTIATION');
    });
  });

  it('FR-ACT-07 an interaction from before Slice 7 still appears, dated by its creation', async () => {
    const id = randomUUID();
    const createdAt = new Date('2026-05-03T11:45:00.000Z');
    await prisma.interaction.create({ data: { id, tenantId, clientId: companies.a, authorUserId: users.salesA, channel: 'MEETING', content: 'Legacy meeting', createdAt } });

    const entry = (await timeline('salesA')).find((candidate) => candidate.id === `interaction:${id}`);
    expect(entry).toMatchObject({
      category: 'ACTIVITY',
      timestamp: createdAt.toISOString(),
      details: { channel: 'MEETING', content: 'Legacy meeting', occurredAt: createdAt.toISOString(), contact: null, result: null },
    });
  });
});
