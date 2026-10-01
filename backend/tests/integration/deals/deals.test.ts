import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaDealWriteTransaction } from '../../../src/deals/infrastructure/PrismaDealWriteTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * M2 Slice 6 end to end (FR-DEAL-01..11, 13, 19, 20, FR-RBAC-17, FR-AUD-09,
 * NFR-PERF-03 board part): a company has several deals, each scoped to its
 * salesperson like a company is, moved through the open stages with every
 * change in its stage history.
 */
describe('Deals and pipeline (M2 Slice 6)', () => {
  const tenantId = `t-deals-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-deals-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    reception: uid('reception'),
    ceo: uid('ceo'),
    leaver: uid('leaver'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens: Record<Who, string> = {} as any;
  let roles: Record<RoleKey, string>;

  const as = (who: Who, server: () => express.Express = () => app) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(server()).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(server()).post(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object = {}) => auth(request(server()).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(server()).delete(`/api/${slug}${path}`)),
    };
  };

  let businessTypeId: string;
  let otherBusinessTypeId: string;
  let areaId: string;
  let cityId: string;
  /** Owned by Sales User A, Sales User B, and nobody. */
  const companies = { a: randomUUID(), b: randomUUID(), unowned: randomUUID() };

  const company = (id: string, name: string, assignedUserId: string | null, typeId = businessTypeId) => ({
    id,
    tenantId,
    name,
    assignedUserId,
    customFieldValues: {},
    businessTypeId: typeId,
    employeeCount: 5,
    areaId,
    cityId,
    lastUpdatedByUserId: users.admin,
  });

  const createDeal = (who: Who, body: object) => as(who).post('/deals', body);
  const dealOf = async (who: Who, body: object) => {
    const res = await createDeal(who, body);
    expect(res.status).toBe(201);
    return res.body.data;
  };
  const board = async (who: Who) => (await as(who).get('/deals/board').expect(200)).body.data;
  const column = (data: any, stage: string) => data.columns.find((c: any) => c.stage === stage);
  const dealAudits = (dealId: string) => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Deal', entityId: dealId } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Deals tenant', urlSlug: slug } });
    roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    businessTypeId = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } })).id;
    otherBusinessTypeId = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, NOT: { id: businessTypeId } } })).id;
    areaId = (await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })).id;
    cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;

    const user = (id: string, roleKey: RoleKey, firstName: string, extra: object = {}) => ({
      id,
      email: `${id}@example.com`,
      hashedPassword: 'x',
      role: 'STAFF',
      roleId: roles[roleKey],
      tenantId,
      firstName,
      lastName: 'Test',
      ...extra,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, RoleKey.Administrator, 'Ana'),
        user(users.salesA, RoleKey.SalesUser, 'Besa'),
        user(users.salesB, RoleKey.SalesUser, 'Dritan'),
        user(users.manager, RoleKey.SalesManager, 'Erion'),
        user(users.reception, RoleKey.Reception, 'Fatos'),
        user(users.ceo, RoleKey.Ceo, 'Gent'),
        user(users.leaver, RoleKey.SalesUser, 'Hana', { isActive: false }),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    await prisma.client.createMany({
      data: [
        company(companies.a, 'Kafe Blloku', users.salesA),
        company(companies.b, 'Furra Dritan', users.salesB, otherBusinessTypeId),
        company(companies.unowned, 'Pa Pronar', null),
      ],
    });
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('creating a deal (FR-DEAL-01)', () => {
    it('FR-DEAL-01 a Sales User creates a deal on their company: New Lead, theirs, with its first history row', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', expectedCloseDate: '2026-12-15', notes: 'Wants a visit first' });
      expect(deal).toMatchObject({
        clientId: companies.a,
        companyName: 'Kafe Blloku',
        type: 'NEW_CONTRACT',
        title: null,
        stage: 'NEW_LEAD',
        ownerUserId: users.salesA,
        ownerName: 'Besa Test',
        expectedCloseDate: '2026-12-15',
        notes: 'Wants a visit first',
        netMonthlyPrice: null,
        annualValue: null,
      });
      expect(deal.history).toEqual([
        expect.objectContaining({ fromStage: null, toStage: 'NEW_LEAD', changedByUserId: users.salesA, changedByName: 'Besa Test' }),
      ]);
    });

    it('FR-DEAL-01 the salesperson defaults to the company\'s, or to the creator when the company has none', async () => {
      expect((await dealOf('manager', { clientId: companies.b, type: 'RENEWAL' })).ownerUserId).toBe(users.salesB);
      expect((await dealOf('manager', { clientId: companies.unowned, type: 'RENEWAL' })).ownerUserId).toBe(users.manager);
    });

    it('FR-DEAL-01 a company with a won New contract deal can have a new open Extra services deal', async () => {
      const won = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', title: 'First contract' });
      // Winning is Slice 13; the closed state is set directly here.
      await prisma.deal.update({ where: { id: won.id }, data: { stageKey: 'WON', wonAt: new Date(), closedAt: new Date() } });
      const extra = await dealOf('salesA', { clientId: companies.a, type: 'EXTRA_SERVICES' });

      const list = (await as('salesA').get(`/deals?clientId=${companies.a}`).expect(200)).body.data;
      const byId = new Map(list.items.map((d: any) => [d.id, d]));
      expect(byId.get(won.id)).toMatchObject({ stage: 'WON' });
      expect(byId.get(extra.id)).toMatchObject({ stage: 'NEW_LEAD', type: 'EXTRA_SERVICES' });
    });

    it('FR-DEAL-01 naming another salesperson than the default takes companies.reassign', async () => {
      await createDeal('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', ownerUserId: users.salesB }).expect(403);
      const deal = await dealOf('manager', { clientId: companies.a, type: 'NEW_CONTRACT', ownerUserId: users.salesB });
      expect(deal.ownerUserId).toBe(users.salesB);
    });

    it('FR-DEAL-01 the salesperson must be an active user the creator\'s scope reaches', async () => {
      const toReception = await createDeal('manager', { clientId: companies.a, type: 'NEW_CONTRACT', ownerUserId: users.reception });
      expect(toReception.status).toBe(400);
      expect(toReception.body).toMatchObject({ code: 'INVALID_DEAL', field: 'ownerUserId' });
      const toLeaver = await createDeal('admin', { clientId: companies.a, type: 'NEW_CONTRACT', ownerUserId: users.leaver });
      expect(toLeaver.status).toBe(400);
      expect(toLeaver.body.field).toBe('ownerUserId');
    });

    it('FR-DEAL-04 a Sales User cannot create a deal on a company outside their scope', async () => {
      const res = await createDeal('salesA', { clientId: companies.b, type: 'NEW_CONTRACT' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_DEAL', field: 'clientId' });
    });

    it('FR-DEAL-01 refuses an unknown type with a field error', async () => {
      const res = await createDeal('salesA', { clientId: companies.a, type: 'PARTNERSHIP' });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe('type');
    });
  });

  describe('the deal page (FR-DEAL-03)', () => {
    it('FR-DEAL-03 returns the company, its live contacts (primary first), stage, value, salesperson, history and notes', async () => {
      await prisma.contactPerson.createMany({
        data: [
          { id: randomUUID(), tenantId, clientId: companies.a, name: 'Zana', phone: '+355690000001', isPrimary: false },
          { id: randomUUID(), tenantId, clientId: companies.a, name: 'Alba', phone: '+355690000002', isPrimary: true, position: 'Drejtore' },
          { id: randomUUID(), tenantId, clientId: companies.a, name: 'Gone', phone: '+355690000003', isPrimary: false, deletedAt: new Date() },
        ],
      });
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', notes: 'Visit in March' });
      const page = (await as('salesA').get(`/deals/${deal.id}`).expect(200)).body.data;

      expect(page).toMatchObject({ companyName: 'Kafe Blloku', stage: 'NEW_LEAD', ownerName: 'Besa Test', notes: 'Visit in March' });
      expect(page).toHaveProperty('netMonthlyPrice', null);
      expect(page).toHaveProperty('annualValue', null);
      expect(page.contacts.map((c: any) => c.name)).toEqual(['Alba', 'Zana']);
      expect(page.contacts[0]).toMatchObject({ isPrimary: true, position: 'Drejtore', phone: '+355690000002' });
      expect(page.history).toHaveLength(1);
    });
  });

  describe('scope (FR-DEAL-04)', () => {
    let dealOfA: any;
    beforeAll(async () => {
      dealOfA = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', title: 'Scope check' });
    });

    it('FR-DEAL-04 Sales User B opening A\'s deal by link gets "not found"; changing it too', async () => {
      await as('salesB').get(`/deals/${dealOfA.id}`).expect(404);
      await as('salesB').patch(`/deals/${dealOfA.id}`, { notes: 'mine now' }).expect(404);
      await as('salesB').post(`/deals/${dealOfA.id}/stage`, { stage: 'CONTACTED' }).expect(404);
      const list = (await as('salesB').get('/deals').expect(200)).body.data;
      expect(list.items.map((d: any) => d.id)).not.toContain(dealOfA.id);
    });

    it('FR-DEAL-04 the Sales Manager and the CEO see both salespeople\'s deals; the CEO cannot change them', async () => {
      await as('manager').get(`/deals/${dealOfA.id}`).expect(200);
      const forB = await dealOf('salesB', { clientId: companies.b, type: 'NEW_CONTRACT' });
      await as('manager').get(`/deals/${forB.id}`).expect(200);
      await as('ceo').get(`/deals/${dealOfA.id}`).expect(200);
      await as('ceo').post(`/deals/${dealOfA.id}/stage`, { stage: 'CONTACTED' }).expect(403);
    });

    it('FR-DEAL-04 Reception has no access to deals', async () => {
      await as('reception').get('/deals').expect(403);
      await as('reception').get('/deals/board').expect(403);
      await as('reception').get(`/deals/${dealOfA.id}`).expect(403);
      await createDeal('reception', { clientId: companies.a, type: 'NEW_CONTRACT' }).expect(403);
    });
  });

  describe('stages (FR-DEAL-06, 07, 09)', () => {
    it('FR-DEAL-07 moves an open deal forwards and back: Negotiation back to Follow-Up', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'NEGOTIATION' }).expect(200);
      const back = (await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'FOLLOW_UP' }).expect(200)).body.data;
      expect(back.stage).toBe('FOLLOW_UP');
    });

    it('FR-DEAL-07 Won and Lost are refused through a stage move: they have their own actions', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      for (const stage of ['WON', 'LOST']) {
        const res = await as('salesA').post(`/deals/${deal.id}/stage`, { stage });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DEAL_STAGE_NOT_ALLOWED');
      }
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'ARCHIVED' }).expect(400);
    });

    it('FR-DEAL-09 the deal page lists every stage change with from, to, who and when', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'CONTACTED' }).expect(200);
      await as('manager').post(`/deals/${deal.id}/stage`, { stage: 'INTERESTED' }).expect(200);
      const detail = (await as('salesA').get(`/deals/${deal.id}`).expect(200)).body.data;
      expect(detail.history.map((h: any) => [h.fromStage, h.toStage, h.changedByName])).toEqual([
        [null, 'NEW_LEAD', 'Besa Test'],
        ['NEW_LEAD', 'CONTACTED', 'Besa Test'],
        ['CONTACTED', 'INTERESTED', 'Erion Test'],
      ]);
      for (const row of detail.history) expect(Number.isNaN(Date.parse(row.at))).toBe(false);
      // A stage change is history, not an audit entry: only reassign and delete are audited.
      expect(await dealAudits(deal.id)).toHaveLength(0);
    });

    it('FR-DEAL-06 renaming "Interested" changes the label; the stage key stays INTERESTED', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'INTERESTED' }).expect(200);
      await as('admin').patch('/status-labels/deal/INTERESTED', { labelSq: 'Shumë i interesuar', labelEn: 'Keen', colour: '#0EA5E9' }).expect(200);

      const labels = (await as('salesA').get('/status-labels/deal').expect(200)).body.data;
      expect(labels.find((l: any) => l.key === 'INTERESTED')).toMatchObject({ labelSq: 'Shumë i interesuar', labelEn: 'Keen' });
      expect((await as('salesA').get(`/deals/${deal.id}`).expect(200)).body.data.stage).toBe('INTERESTED');
    });

    it('FR-DEAL-06 deal stage labels are edited with activityResults.manage too; contract labels still need settings.manage', async () => {
      const custom = await prisma.role.create({
        data: { id: randomUUID(), tenantId, key: `LISTS_${randomUUID().slice(0, 6)}`, nameSq: 'Lista', nameEn: 'Lists', isSystem: false },
      });
      await prisma.rolePermission.create({ data: { roleId: custom.id, permissionKey: 'activityResults.manage' } });
      const editorId = uid('lists');
      await prisma.user.create({
        data: { id: editorId, email: `${editorId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: custom.id, tenantId },
      });
      const token = tokenService.sign({ userId: editorId, role: 'STAFF', tenantId, tenantSlug: slug } as any);
      const patch = (path: string) =>
        request(app).patch(`/api/${slug}${path}`).set('Authorization', `Bearer ${token}`).send({ labelSq: 'Negociata', colour: '#EA580C' });

      await patch('/status-labels/deal/NEGOTIATION').expect(200);
      await patch('/status-labels/contract/ACTIVE').expect(403);
    });
  });

  describe('editing and reassigning (FR-DEAL-01, 05)', () => {
    it('FR-DEAL-01 the salesperson edits title, type, expected close date and notes', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      const edited = (
        await as('salesA').patch(`/deals/${deal.id}`, { title: 'Two sites', type: 'EXTRA_SERVICES', expectedCloseDate: null, notes: 'Second site in Durrës' }).expect(200)
      ).body.data;
      expect(edited).toMatchObject({ title: 'Two sites', type: 'EXTRA_SERVICES', expectedCloseDate: null, notes: 'Second site in Durrës' });
    });

    it('FR-DEAL-05 changing the salesperson needs companies.reassign and is audited with old and new', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await as('salesA').post(`/deals/${deal.id}/reassign`, { ownerUserId: users.salesB }).expect(403);

      const moved = (await as('manager').post(`/deals/${deal.id}/reassign`, { ownerUserId: users.salesB }).expect(200)).body.data;
      expect(moved.ownerUserId).toBe(users.salesB);

      const audits = await dealAudits(deal.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: 'UPDATE', userId: users.manager, entityLabel: 'Kafe Blloku – Kontratë e re' });
      expect(audits[0].changes).toEqual([{ field: 'ownerUserId', old: users.salesA, new: users.salesB }]);

      await as('salesA').get(`/deals/${deal.id}`).expect(404);
      await as('salesB').get(`/deals/${deal.id}`).expect(200);
    });

    it('FR-DEAL-05 a deal cannot be handed to someone the reassigner\'s scope does not reach, or to an inactive user', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      const res = await as('manager').post(`/deals/${deal.id}/reassign`, { ownerUserId: users.reception });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe('ownerUserId');
      await as('admin').post(`/deals/${deal.id}/reassign`, { ownerUserId: users.leaver }).expect(400);
    });

    it('FR-AUD-09 a failing audit write rolls the reassignment back', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      const failing = createApp({
        dealWriteTransaction: new PrismaDealWriteTransaction(prisma, () => ({
          record: async () => {
            throw new Error('audit store down');
          },
        })),
      });
      const res = await as('manager', () => failing).post(`/deals/${deal.id}/reassign`, { ownerUserId: users.salesB });
      expect(res.status).toBe(500);
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).ownerUserId).toBe(users.salesA);
    });
  });

  describe('pipeline board (FR-DEAL-10, NFR-PERF-03)', () => {
    it('FR-DEAL-10 one column per stage in pipeline order, each with its count and total value', async () => {
      const data = await board('salesA');
      expect(data.columns.map((c: any) => c.stage)).toEqual([
        'NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_PREPARED', 'OFFER_SENT', 'FOLLOW_UP', 'NEGOTIATION', 'WON', 'LOST',
      ]);
      for (const c of data.columns) {
        expect(c).toEqual(expect.objectContaining({ count: expect.any(Number), totalNetMonthlyPrice: null, items: expect.any(Array) }));
      }
      const card = column(data, 'NEW_LEAD').items[0];
      expect(card).toEqual(
        expect.objectContaining({ companyName: 'Kafe Blloku', ownerName: 'Besa Test', netMonthlyPrice: null, nextFollowUpAt: null })
      );
    });

    it('FR-DEAL-10 moving a card from Contacted to Interested updates both column counts', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'CONTACTED' }).expect(200);
      const before = await board('salesA');
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'INTERESTED' }).expect(200);
      const after = await board('salesA');

      expect(column(after, 'CONTACTED').count).toBe(column(before, 'CONTACTED').count - 1);
      expect(column(after, 'INTERESTED').count).toBe(column(before, 'INTERESTED').count + 1);
      expect(column(after, 'INTERESTED').items.map((d: any) => d.id)).toContain(deal.id);
    });

    it('FR-DEAL-10 the Won and Lost columns show this month only', async () => {
      const thisMonth = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      const lastYear = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await prisma.deal.update({ where: { id: thisMonth.id }, data: { stageKey: 'LOST', lostAt: new Date(), closedAt: new Date() } });
      const old = new Date(Date.now() - 400 * 24 * 3600 * 1000);
      await prisma.deal.update({ where: { id: lastYear.id }, data: { stageKey: 'LOST', lostAt: old, closedAt: old } });

      const lost = column(await board('salesA'), 'LOST').items.map((d: any) => d.id);
      expect(lost).toContain(thisMonth.id);
      expect(lost).not.toContain(lastYear.id);
    });

    it('FR-DEAL-10 the board is scoped: Sales User B sees none of A\'s cards', async () => {
      const data = await board('salesB');
      const owners = new Set(data.columns.flatMap((c: any) => c.items.map((d: any) => d.ownerUserId)));
      expect([...owners].every((owner) => owner === users.salesB)).toBe(true);
    });

    it('NFR-PERF-03 a column returns at most 50 cards with a cursor, and the column page continues it', async () => {
      await prisma.deal.createMany({
        data: Array.from({ length: 55 }, (_, i) => ({
          id: randomUUID(),
          tenantId,
          clientId: companies.unowned,
          ownerUserId: users.manager,
          createdByUserId: users.manager,
          type: 'NEW_CONTRACT',
          stageKey: 'OFFER_PREPARED',
          updatedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, i % 3)),
        })),
      });
      const first = column(await board('manager'), 'OFFER_PREPARED');
      expect(first.count).toBeGreaterThanOrEqual(55);
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).toEqual(expect.any(String));

      const rest = (await as('manager').get(`/deals/board/column?stage=OFFER_PREPARED&cursor=${encodeURIComponent(first.nextCursor)}`).expect(200)).body.data;
      const seen = new Set([...first.items, ...rest.items].map((d: any) => d.id));
      expect(seen.size).toBe(first.count);
      expect(rest.nextCursor).toBeNull();

      await as('manager').get('/deals/board/column?stage=OFFER_PREPARED&cursor=garbage').expect(400);
      await as('manager').get('/deals/board/column?stage=NOPE').expect(400);
    });
  });

  describe('list (FR-DEAL-11)', () => {
    it('FR-DEAL-11 filtering the Sales Manager\'s list by one salesperson shows only that salesperson\'s deals', async () => {
      await dealOf('salesB', { clientId: companies.b, type: 'RENEWAL' });
      const list = (await as('manager').get(`/deals?ownerUserId=${users.salesB}`).expect(200)).body.data;
      expect(list.total).toBeGreaterThan(0);
      expect(list.items.every((d: any) => d.ownerUserId === users.salesB)).toBe(true);
    });

    it('FR-DEAL-11 filters by stage, type, business type, area, city and expected close date, and sorts', async () => {
      const early = await dealOf('salesB', { clientId: companies.b, type: 'RENEWAL', title: 'Alpha', expectedCloseDate: '2027-01-10' });
      const late = await dealOf('salesB', { clientId: companies.b, type: 'RENEWAL', title: 'Beta', expectedCloseDate: '2027-02-20' });

      const query =
        `/deals?stage=NEW_LEAD&type=RENEWAL&businessTypeId=${otherBusinessTypeId}&areaId=${areaId}&cityId=${cityId}` +
        '&expectedCloseFrom=2027-01-01&expectedCloseTo=2027-03-01&sort=expectedCloseDate&direction=desc';
      const list = (await as('manager').get(query).expect(200)).body.data;
      expect(list.items.map((d: any) => d.id)).toEqual([late.id, early.id]);

      const january = (await as('manager').get(`${query.replace('2027-03-01', '2027-01-31')}`).expect(200)).body.data;
      expect(january.items.map((d: any) => d.id)).toEqual([early.id]);

      const otherType = (await as('manager').get(`/deals?businessTypeId=${businessTypeId}&type=RENEWAL&expectedCloseFrom=2027-01-01`).expect(200)).body.data;
      expect(otherType.items).toHaveLength(0);
    });

    it('FR-DEAL-11 pages in the query: the total counts every match, a page holds pageSize', async () => {
      const page = (await as('manager').get('/deals?pageSize=2&page=1&sort=createdAt&direction=asc').expect(200)).body.data;
      expect(page.items).toHaveLength(2);
      const all = (await as('manager').get('/deals?pageSize=100').expect(200)).body.data;
      expect(page.total).toBe(all.total);
      await as('manager').get('/deals?sort=price').expect(400);
    });
  });

  describe('delete (FR-DEAL-19)', () => {
    it('FR-DEAL-19 a soft delete needs deals.delete, is audited, and the deal disappears from the list and the board', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', title: 'To delete' });
      await as('salesA').delete(`/deals/${deal.id}`).expect(403);
      await as('manager').delete(`/deals/${deal.id}`).expect(204);

      await as('salesA').get(`/deals/${deal.id}`).expect(404);
      const list = (await as('salesA').get('/deals?pageSize=100').expect(200)).body.data;
      expect(list.items.map((d: any) => d.id)).not.toContain(deal.id);
      expect(column(await board('salesA'), 'NEW_LEAD').items.map((d: any) => d.id)).not.toContain(deal.id);

      const audits = await dealAudits(deal.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: 'DELETE', entityLabel: 'To delete', userId: users.manager });
      expect(await prisma.deal.findUnique({ where: { id: deal.id } })).toMatchObject({ deletedAt: expect.any(Date) });
      await as('manager').delete(`/deals/${deal.id}`).expect(404);
    });
  });

  describe('company history and response (FR-DEAL-20, FR-RBAC-17)', () => {
    it('FR-DEAL-20 the company timeline shows "Deal created" and the stage changes', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT', title: 'Timeline deal' });
      await as('salesA').post(`/deals/${deal.id}/stage`, { stage: 'CONTACTED' }).expect(200);

      const timeline = (await as('salesA').get(`/clients/${companies.a}/history?type=DEAL`).expect(200)).body.timeline;
      const mine = timeline.filter((e: any) => e.details.dealId === deal.id);
      expect(mine.map((e: any) => e.type).sort()).toEqual(['DEAL_CREATED', 'DEAL_STAGE_CHANGED']);
      expect(mine.find((e: any) => e.type === 'DEAL_STAGE_CHANGED')).toMatchObject({
        category: 'DEAL',
        actor: { id: users.salesA, name: 'Besa Test' },
        details: { title: 'Timeline deal', type: 'NEW_CONTRACT', fromStage: 'NEW_LEAD', toStage: 'CONTACTED' },
      });
    });

    it('FR-RBAC-17 Reception\'s company response has no deals, and its timeline no deal entries or amounts', async () => {
      await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      const companyRes = await as('reception').get(`/clients/${companies.a}`).expect(200);
      expect(companyRes.body).not.toHaveProperty('deals');
      expectNoCommercialFields(companyRes.body);

      const history = (await as('reception').get(`/clients/${companies.a}/history`).expect(200)).body;
      expect(history.timeline.filter((e: any) => e.category === 'DEAL')).toEqual([]);
      expectNoCommercialFields(history);
    });

    it('FR-RBAC-17 without commercial.view, deal values are removed from the board, the list and the deal', async () => {
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await prisma.rolePermission.delete({ where: { roleId_permissionKey: { roleId: roles[RoleKey.SalesUser], permissionKey: 'commercial.view' } } });
      try {
        // A fresh app: the running one caches each user's grants.
        const fresh = createApp();
        const salesA = as('salesA', () => fresh);
        const boardRes = await salesA.get('/deals/board').expect(200);
        expect(boardRes.body.data.columns[0]).not.toHaveProperty('totalNetMonthlyPrice');
        expectNoCommercialFields(boardRes.body);
        expectNoCommercialFields((await salesA.get('/deals').expect(200)).body);
        expectNoCommercialFields((await salesA.get(`/deals/${deal.id}`).expect(200)).body);
      } finally {
        await prisma.rolePermission.create({ data: { roleId: roles[RoleKey.SalesUser], permissionKey: 'commercial.view', scope: 'OWN' } });
      }
    });
  });

  describe('creating a company with its first deal (FR-DEAL-02)', () => {
    const newCompany = (createDeal: boolean) => ({
      customFieldValues: { Name: `Kompania ${randomUUID().slice(0, 6)}`, Status: 'PROSPECT' },
      profile: { businessTypeId, employeeCount: 3, areaId, cityId },
      contacts: [{ name: 'Elira', phone: '+355691112233' }],
      createDeal,
    });

    it('FR-DEAL-02 ticking "create a deal" creates the company and a New Lead deal, owned by its salesperson', async () => {
      const res = await as('salesA').post('/clients', newCompany(true)).expect(201);
      const deals = await prisma.deal.findMany({ where: { tenantId, clientId: res.body.id }, include: { stageHistory: true } });
      expect(deals).toHaveLength(1);
      expect(deals[0]).toMatchObject({ stageKey: 'NEW_LEAD', type: 'NEW_CONTRACT', ownerUserId: users.salesA, title: null });
      expect(deals[0].stageHistory).toHaveLength(1);
    });

    it('FR-DEAL-02 without the box ticked, no deal is created', async () => {
      const res = await as('salesA').post('/clients', newCompany(false)).expect(201);
      expect(await prisma.deal.count({ where: { tenantId, clientId: res.body.id } })).toBe(0);
    });

    it('FR-DEAL-02 asking for a deal without deals.edit is refused and creates no company', async () => {
      await prisma.rolePermission.delete({ where: { roleId_permissionKey: { roleId: roles[RoleKey.SalesUser], permissionKey: 'deals.edit' } } });
      try {
        const body = newCompany(true);
        const fresh = createApp(); // the running app caches each user's grants
        await as('salesA', () => fresh).post('/clients', body).expect(403);
        expect(await prisma.client.count({ where: { tenantId, name: body.customFieldValues.Name } })).toBe(0);
      } finally {
        await prisma.rolePermission.create({ data: { roleId: roles[RoleKey.SalesUser], permissionKey: 'deals.edit', scope: 'OWN' } });
      }
    });
  });

  describe('lost reasons in use', () => {
    it('a lost reason a deal points at counts as in use and cannot be deleted', async () => {
      const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId } });
      const deal = await dealOf('salesA', { clientId: companies.a, type: 'NEW_CONTRACT' });
      await prisma.deal.update({ where: { id: deal.id }, data: { stageKey: 'LOST', lostReasonId: reason.id, closedAt: new Date() } });
      const res = await as('admin').delete(`/lookups/lost-reasons/${reason.id}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LOOKUP_ITEM_IN_USE');
    });
  });
});
