import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaNotificationSettingsRepository } from '../../../src/notifications/infrastructure/PrismaNotificationSettingsRepository';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { FollowUpDueJob } from '../../../src/scheduler/jobs/FollowUpDueJob';
import { FollowUpDailySummaryJob } from '../../../src/scheduler/jobs/FollowUpDailySummaryJob';
import { PrismaFollowUpSchedulerQueries } from '../../../src/appointments/infrastructure/followUps/PrismaFollowUpSchedulerQueries';
import { followUpDue } from '../../../src/appointments/domain/followUps/FollowUpSchedule';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const DAY = 24 * 60 * 60 * 1000;
const TIRANE = 'Europe/Tirane';

/**
 * M2 Slice 11 end to end (FR-FUP-01..10, FR-ACT-04, FR-DEAL-08, 12): one-click
 * follow-ups from a company, a deal or a saved activity, "My follow-ups" and
 * its overdue count, completing with an activity, rescheduling, cancelling,
 * the team view, reassigning, the due notification and the deal markers.
 */
describe('Follow-ups (M2 Slice 11)', () => {
  const tenantId = `t-followups-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-fu-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    ceo: uid('ceo'),
    reception: uid('reception'),
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

  const newDeal = async (clientId = companies.a, who: Who = 'salesA') => {
    const res = await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };
  const call = (overrides: object = {}) => ({
    channel: 'CALL',
    content: 'Called the office manager',
    contactPersonId: contacts.a,
    resultId,
    nextAction: 'Send the revised offer',
    ...overrides,
  });
  const schedule = (who: Who, body: object) => as(who).post('/follow-ups', body);
  /** A follow-up already past its due time, which the API never creates. */
  const plantOverdue = async (assignedUserId: string, input: { clientId?: string; dealId?: string; daysAgo?: number } = {}) => {
    const id = randomUUID();
    await prisma.appointment.create({
      data: {
        id,
        tenantId,
        clientId: input.clientId ?? companies.a,
        dealId: input.dealId ?? null,
        assignedUserId,
        scheduledAt: new Date(Date.now() - (input.daysAgo ?? 1) * DAY),
        status: 'SCHEDULED',
        kind: 'FOLLOW_UP',
        type: 'CALL',
      },
    });
    return id;
  };
  const notifications = new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma));
  const notificationsOf = (userId: string, type: string) =>
    prisma.notification.findMany({ where: { tenantId, recipientUserId: userId, type } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Follow-ups tenant', urlSlug: slug, timezone: TIRANE } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    resultId = (await prisma.activityResult.findFirstOrThrow({ where: { tenantId, nameEn: 'Reached – interested' } })).id;

    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.ceo, roles[RoleKey.Ceo], 'Fiona'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
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

  describe('scheduling (FR-FUP-01, 02, FR-ACT-04)', () => {
    it('FR-FUP-01 "+3 days" from the company is due three calendar days on, at 09:00 in the workspace zone', async () => {
      const before = new Date();
      const res = await schedule('salesA', { clientId: companies.a, intervalDays: 3 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        clientId: companies.a,
        companyName: 'Kafe Blloku',
        type: 'CALL',
        assignedUserId: users.salesA,
        intervalDays: 3,
        status: 'SCHEDULED',
        isOverdue: false,
      });
      expect(res.body.data.scheduledAt).toBe(followUpDue(before, 3, TIRANE).toISOString());
    });

    it('FR-FUP-01 a custom date and time is kept as chosen', async () => {
      const res = await schedule('salesA', { clientId: companies.a, dueDate: '2099-03-14', time: '15:45', type: 'VISIT' });
      expect(res.status).toBe(201);
      // March 2099 is winter time in Tirana: 15:45 there is 14:45 UTC.
      expect(res.body.data).toMatchObject({ scheduledAt: '2099-03-14T14:45:00.000Z', type: 'VISIT', intervalDays: null });
    });

    it('FR-FUP-02 the note defaults to the activity\'s next action, with its deal and contact, for the deal\'s salesperson', async () => {
      const dealId = await newDeal();
      const activity = await as('salesA').post(`/clients/${companies.a}/interactions`, call({ dealId })).expect(201);

      const res = await schedule('manager', { clientId: companies.a, fromActivityId: activity.body.id, intervalDays: 5 });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        notes: 'Send the revised offer',
        dealId,
        contactPersonId: contacts.a,
        contactName: 'Elira Hoxha',
        type: 'CALL',
        // The deal's salesperson, not the manager who clicked.
        assignedUserId: users.salesA,
      });
    });

    it('FR-ACT-04 saving a call and clicking "+5 days" creates both the activity and the follow-up', async () => {
      const activity = await as('salesA').post(`/clients/${companies.a}/interactions`, call({ nextAction: 'Call back about the price' })).expect(201);
      const followUp = await schedule('salesA', { clientId: companies.a, fromActivityId: activity.body.id, intervalDays: 5 }).expect(201);

      expect(await prisma.interaction.count({ where: { id: activity.body.id } })).toBe(1);
      expect(followUp.body.data.notes).toBe('Call back about the price');
    });

    it('FR-FUP-02 refuses a deal of another company, a contact of another company and an activity of another company', async () => {
      const otherDeal = await newDeal(companies.b, 'salesB');
      const res = await schedule('admin', { clientId: companies.a, dealId: otherDeal, intervalDays: 3 });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_FOLLOW_UP', field: 'dealId' });

      const contact = await schedule('admin', { clientId: companies.a, contactPersonId: contacts.b, intervalDays: 3 });
      expect(contact.body).toMatchObject({ code: 'INVALID_FOLLOW_UP', field: 'contactPersonId' });

      const activity = await as('salesB').post(`/clients/${companies.b}/interactions`, call({ contactPersonId: contacts.b })).expect(201);
      const fromOther = await schedule('admin', { clientId: companies.a, fromActivityId: activity.body.id, intervalDays: 3 });
      expect(fromOther.body).toMatchObject({ code: 'INVALID_FOLLOW_UP', field: 'fromActivityId' });
    });

    it('FR-FUP-02 needs either an interval or a date, and never one in the past', async () => {
      expect((await schedule('salesA', { clientId: companies.a })).body).toMatchObject({ field: 'dueDate' });
      expect((await schedule('salesA', { clientId: companies.a, dueDate: '2020-01-01' })).body).toMatchObject({ field: 'dueAt' });
    });
  });

  describe('scope and permissions (FR-RBAC-11, NFR-SEC-04)', () => {
    it('NFR-SEC-04 a Sales User cannot schedule on another salesperson\'s company, or for another salesperson', async () => {
      const other = await schedule('salesA', { clientId: companies.b, intervalDays: 3 });
      expect(other.status).toBe(400);
      expect(other.body.field).toBe('clientId');

      const forB = await schedule('salesA', { clientId: companies.a, intervalDays: 3, assignedUserId: users.salesB });
      expect(forB.body.field).toBe('assignedUserId');
    });

    it('NFR-SEC-04 another Sales User\'s follow-up is "not found"; Reception has no follow-ups at all', async () => {
      const own = (await schedule('salesA', { clientId: companies.a, intervalDays: 7 }).expect(201)).body.data.id;
      expect((await as('salesB').get(`/follow-ups/${own}`)).status).toBe(404);
      expect((await as('salesB').post(`/follow-ups/${own}/cancel`, { reason: 'Not mine' })).status).toBe(404);
      expect((await as('reception').get('/follow-ups/mine')).status).toBe(403);
      expect((await as('reception').post('/follow-ups', { clientId: companies.a, intervalDays: 3 })).status).toBe(403);
    });
  });

  describe('My follow-ups (FR-FUP-04, 05, 07)', () => {
    it('FR-FUP-04 a follow-up is in "My follow-ups" right after it is created', async () => {
      const id = (await schedule('salesB', { clientId: companies.b, intervalDays: 3 }).expect(201)).body.data.id;
      const mine = (await as('salesB').get('/follow-ups/mine').expect(200)).body.data;
      expect([...mine.overdue, ...mine.today, ...mine.upcoming].map((item: any) => item.id)).toContain(id);
    });

    it('FR-FUP-05, 07 an overdue follow-up is grouped as Overdue and marked overdue, and the menu count follows', async () => {
      const before = (await as('salesB').get('/follow-ups/overdue-count').expect(200)).body.data.count;
      const first = await plantOverdue(users.salesB, { clientId: companies.b });
      const second = await plantOverdue(users.salesB, { clientId: companies.b, daysAgo: 3 });

      expect((await as('salesB').get('/follow-ups/overdue-count').expect(200)).body.data.count).toBe(before + 2);
      const mine = (await as('salesB').get('/follow-ups/mine').expect(200)).body.data;
      const overdue = mine.overdue.filter((item: any) => [first, second].includes(item.id));
      expect(overdue).toHaveLength(2);
      expect(overdue.every((item: any) => item.isOverdue)).toBe(true);
      // Oldest first.
      expect(overdue[0].id).toBe(second);
    });

    it('FR-FUP-07 the menu badge shows 2 when two follow-ups are overdue', async () => {
      const lone = uid('lone');
      const salesRole = (await prisma.role.findFirstOrThrow({ where: { tenantId, key: RoleKey.SalesUser } })).id;
      await prisma.user.create({
        data: { id: lone, email: `${lone}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: salesRole, tenantId },
      });
      await plantOverdue(lone);
      await plantOverdue(lone, { daysAgo: 2 });
      const token = tokenService.sign({ userId: lone, role: 'STAFF', tenantId, tenantSlug: slug } as any);
      const res = await request(app).get(`/api/${slug}/follow-ups/overdue-count`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.data.count).toBe(2);
    });
  });

  describe('completing, rescheduling, cancelling (FR-FUP-06)', () => {
    it('FR-FUP-06 completing records the activity that happened and links it; the follow-up closes', async () => {
      const dealId = await newDeal();
      const followUp = (await schedule('salesA', { clientId: companies.a, dealId, intervalDays: 3, type: 'VISIT' }).expect(201)).body.data;

      const res = await as('salesA').post(`/follow-ups/${followUp.id}/complete`, {
        channel: 'VISIT',
        contactPersonId: contacts.a,
        resultId,
        dealId,
        content: 'Visited, agreed the terms',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.followUp).toMatchObject({ status: 'COMPLETED', completedInteractionId: res.body.data.activity.id });
      // FR-PRF-05: the completion date the Performance screen counts it on.
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: followUp.id } })).completedAt).not.toBeNull();
      expect(res.body.data.activity).toMatchObject({ channel: 'VISIT', dealId, clientId: companies.a });

      // It leaves "My follow-ups" and cannot be completed twice.
      const mine = (await as('salesA').get('/follow-ups/mine').expect(200)).body.data;
      expect([...mine.overdue, ...mine.today, ...mine.upcoming].map((item: any) => item.id)).not.toContain(followUp.id);
      const again = await as('salesA').post(`/follow-ups/${followUp.id}/complete`, call());
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('FOLLOW_UP_CLOSED');
    });

    it('FR-FUP-06 an activity the server refuses leaves the follow-up open', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      const res = await as('salesA').post(`/follow-ups/${followUp.id}/complete`, { channel: 'CALL', content: 'No contact given' });
      expect(res.status).toBe(400);
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: followUp.id } })).status).toBe('SCHEDULED');
    });

    it('FR-FUP-06 rescheduling keeps the previous date in its history', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      const res = await as('salesA').post(`/follow-ups/${followUp.id}/reschedule`, { dueDate: '2099-06-01', time: '10:00', reason: 'On holiday' });
      expect(res.status).toBe(200);
      expect(res.body.data.scheduledAt).toBe('2099-06-01T08:00:00.000Z');
      expect(res.body.data.history).toEqual([
        expect.objectContaining({ previousDate: followUp.scheduledAt, newDate: '2099-06-01T08:00:00.000Z', reason: 'On holiday' }),
      ]);
    });

    it('FR-FUP-06 cancelling needs a reason, which is kept', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      expect((await as('salesA').post(`/follow-ups/${followUp.id}/cancel`, { reason: ' ' })).status).toBe(400);
      const res = await as('salesA').post(`/follow-ups/${followUp.id}/cancel`, { reason: 'Company closed for the season' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Company closed for the season' });
    });

    it('FR-FUP-06 the company history shows the follow-up as scheduled, then completed or cancelled', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      const timeline = async () => (await as('salesA').get(`/clients/${companies.a}/history?limit=100`).expect(200)).body.timeline as any[];
      expect((await timeline()).find((entry) => entry.id === `appointment:${followUp.id}`)?.type).toBe('FOLLOW_UP_SCHEDULED');
      await as('salesA').post(`/follow-ups/${followUp.id}/cancel`, { reason: 'Not needed' }).expect(200);
      expect((await timeline()).find((entry) => entry.id === `appointment:${followUp.id}`)?.type).toBe('FOLLOW_UP_CANCELLED');
    });
  });

  describe('the team (FR-FUP-08, 10)', () => {
    it('FR-FUP-08 the Sales Manager sees each salesperson\'s overdue follow-ups, filtered by salesperson', async () => {
      const ofA = await plantOverdue(users.salesA);
      const ofB = await plantOverdue(users.salesB, { clientId: companies.b });

      const all = (await as('manager').get('/follow-ups?overdueOnly=true').expect(200)).body.data.items.map((item: any) => item.id);
      expect(all).toEqual(expect.arrayContaining([ofA, ofB]));

      const onlyB = (await as('manager').get(`/follow-ups?overdueOnly=true&assignedUserId=${users.salesB}`).expect(200)).body.data.items;
      expect(onlyB.map((item: any) => item.id)).toContain(ofB);
      expect(onlyB.every((item: any) => item.assignedUserId === users.salesB && item.isOverdue)).toBe(true);
    });

    it('FR-FUP-08 the CEO sees the same, read-only: every write is refused', async () => {
      const ofA = await plantOverdue(users.salesA);
      const seen = (await as('ceo').get('/follow-ups?overdueOnly=true').expect(200)).body.data.items.map((item: any) => item.id);
      expect(seen).toContain(ofA);

      expect((await as('ceo').post('/follow-ups', { clientId: companies.a, intervalDays: 3 })).status).toBe(403);
      expect((await as('ceo').post(`/follow-ups/${ofA}/cancel`, { reason: 'x' })).status).toBe(403);
      expect((await as('ceo').post(`/follow-ups/${ofA}/reassign`, { assignedUserId: users.salesB })).status).toBe(403);
    });

    it('FR-FUP-08 a Sales User\'s team view is only their own', async () => {
      const ofB = await plantOverdue(users.salesB, { clientId: companies.b });
      const seen = (await as('salesA').get('/follow-ups?overdueOnly=true').expect(200)).body.data.items;
      expect(seen.map((item: any) => item.id)).not.toContain(ofB);
      expect(seen.every((item: any) => item.assignedUserId === users.salesA)).toBe(true);
    });

    it('FR-FUP-10 the Sales Manager reassigns a follow-up, and it moves to the other salesperson\'s list', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      const res = await as('manager').post(`/follow-ups/${followUp.id}/reassign`, { assignedUserId: users.salesB });
      expect(res.status).toBe(200);
      expect(res.body.data.assignedUserId).toBe(users.salesB);

      const idsOf = async (who: Who) => {
        const mine = (await as(who).get('/follow-ups/mine').expect(200)).body.data;
        return [...mine.overdue, ...mine.today, ...mine.upcoming].map((item: any) => item.id);
      };
      expect(await idsOf('salesB')).toContain(followUp.id);
      expect(await idsOf('salesA')).not.toContain(followUp.id);
      expect(await notificationsOf(users.salesB, 'FOLLOW_UP_ASSIGNED')).toHaveLength(1);
    });

    it('FR-FUP-10 a Sales User cannot reassign, and nobody reassigns to Reception', async () => {
      const followUp = (await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201)).body.data;
      expect((await as('salesA').post(`/follow-ups/${followUp.id}/reassign`, { assignedUserId: users.salesB })).status).toBe(403);
      const toReception = await as('manager').post(`/follow-ups/${followUp.id}/reassign`, { assignedUserId: users.reception });
      expect(toReception.status).toBe(400);
      expect(toReception.body.field).toBe('assignedUserId');
    });
  });

  describe('the deal (FR-DEAL-08, 12, FR-DEAL-03)', () => {
    it('FR-DEAL-08 a follow-up on an Offer Sent deal moves it to Follow-Up, automatically', async () => {
      const dealId = await newDeal();
      await prisma.deal.update({ where: { id: dealId }, data: { stageKey: 'OFFER_SENT' } });

      await schedule('salesA', { clientId: companies.a, dealId, intervalDays: 3 }).expect(201);

      const deal = (await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data;
      expect(deal.stage).toBe('FOLLOW_UP');
      expect(deal.history.at(-1)).toMatchObject({ fromStage: 'OFFER_SENT', toStage: 'FOLLOW_UP', changedByUserId: null });
    });

    it('FR-DEAL-08 a follow-up on a deal in any other stage leaves the stage alone', async () => {
      const dealId = await newDeal();
      await prisma.deal.update({ where: { id: dealId }, data: { stageKey: 'INTERESTED' } });
      await schedule('salesA', { clientId: companies.a, dealId, intervalDays: 3 }).expect(201);
      expect((await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data.stage).toBe('INTERESTED');
    });

    it('FR-DEAL-03 the deal page lists its open follow-ups', async () => {
      const dealId = await newDeal();
      const followUp = (await schedule('salesA', { clientId: companies.a, dealId, intervalDays: 7 }).expect(201)).body.data;
      const items = (await as('salesA').get(`/follow-ups?dealId=${dealId}`).expect(200)).body.data.items;
      expect(items.map((item: any) => item.id)).toEqual([followUp.id]);
    });

    it('FR-DEAL-12 a deal with a follow-up due yesterday shows the overdue marker on the list and the board', async () => {
      const dealId = await newDeal();
      await plantOverdue(users.salesA, { dealId });

      const listed = (await as('salesA').get(`/deals?clientId=${companies.a}&pageSize=100`).expect(200)).body.data.items.find(
        (deal: any) => deal.id === dealId
      );
      expect(listed).toMatchObject({ hasOverdueFollowUp: true });
      expect(listed.nextFollowUpAt).not.toBeNull();

      const board = (await as('salesA').get('/deals/board').expect(200)).body.data;
      const card = board.columns.flatMap((column: any) => column.items).find((deal: any) => deal.id === dealId);
      expect(card).toMatchObject({ hasOverdueFollowUp: true });
    });

    it('FR-DEAL-12 a deal with no activity for the configured days is marked stale; an activity clears it', async () => {
      const dealId = await newDeal();
      await prisma.deal.update({ where: { id: dealId }, data: { createdAt: new Date(Date.now() - 20 * DAY) } });
      const find = async () =>
        (await as('salesA').get(`/deals?clientId=${companies.a}&pageSize=100`).expect(200)).body.data.items.find((deal: any) => deal.id === dealId);

      expect(await find()).toMatchObject({ isStale: true, hasOverdueFollowUp: false });

      // The Administrator raises the threshold past the deal's age.
      await as('admin').patch('/sales-settings', { staleDealDays: 30 }).expect(200);
      expect(await find()).toMatchObject({ isStale: false });
      await as('admin').patch('/sales-settings', { staleDealDays: 14 }).expect(200);

      await as('salesA').post(`/clients/${companies.a}/interactions`, call({ dealId })).expect(201);
      expect(await find()).toMatchObject({ isStale: false });
    });

    it('FR-DEAL-12 the stale days are the Administrator\'s to set, within bounds', async () => {
      expect((await as('admin').get('/sales-settings').expect(200)).body.data).toEqual({ staleDealDays: 14 });
      expect((await as('salesA').patch('/sales-settings', { staleDealDays: 5 })).status).toBe(403);
      expect((await as('admin').patch('/sales-settings', { staleDealDays: 0 })).status).toBe(400);
    });
  });

  describe('notifications (FR-FUP-09)', () => {
    const queries = () => new PrismaFollowUpSchedulerQueries(prisma);

    it('FR-FUP-09 a follow-up due at 09:00 produces exactly one notification at 09:00', async () => {
      const id = randomUUID();
      const dueAt = new Date(Date.now() - 60 * 1000);
      await prisma.appointment.create({
        data: { id, tenantId, clientId: companies.a, assignedUserId: users.salesA, scheduledAt: dueAt, status: 'SCHEDULED', kind: 'FOLLOW_UP', type: 'CALL' },
      });
      const job = new FollowUpDueJob(queries(), new PrismaNotificationSettingsRepository(prisma), notifications);
      const dueFor = async () => (await notificationsOf(users.salesA, 'FOLLOW_UP_DUE')).filter((n) => n.entityId === id);

      await job.run(new Date());
      expect(await dueFor()).toHaveLength(1);
      expect((await dueFor())[0].params).toMatchObject({ clientName: 'Kafe Blloku', scheduledAt: dueAt.toISOString(), followUpType: 'CALL' });

      await job.run(new Date());
      expect(await dueFor()).toHaveLength(1);
    });

    it('FR-FUP-09 nothing is sent before the due time, or when the workspace switched it off', async () => {
      const id = randomUUID();
      await prisma.appointment.create({
        data: { id, tenantId, clientId: companies.a, assignedUserId: users.salesA, scheduledAt: new Date(Date.now() + DAY), status: 'SCHEDULED', kind: 'FOLLOW_UP', type: 'CALL' },
      });
      const job = new FollowUpDueJob(queries(), new PrismaNotificationSettingsRepository(prisma), notifications);
      await job.run(new Date());
      expect((await notificationsOf(users.salesA, 'FOLLOW_UP_DUE')).filter((n) => n.entityId === id)).toHaveLength(0);

      await prisma.notificationSettings.upsert({
        where: { tenantId },
        create: { tenantId, followUpDueNotificationsEnabled: false },
        update: { followUpDueNotificationsEnabled: false },
      });
      await job.run(new Date(Date.now() + 2 * DAY));
      expect((await notificationsOf(users.salesA, 'FOLLOW_UP_DUE')).filter((n) => n.entityId === id)).toHaveLength(0);
      await prisma.notificationSettings.update({ where: { tenantId }, data: { followUpDueNotificationsEnabled: true } });
    });

    it('FR-FUP-09 the optional daily summary goes once a day, at 07:30 in the workspace zone, to each salesperson with follow-ups', async () => {
      await prisma.notificationSettings.upsert({
        where: { tenantId },
        create: { tenantId, followUpDailySummaryEnabled: true },
        update: { followUpDailySummaryEnabled: true },
      });
      // A follow-up later today for Sales User B, so B has something to read.
      const morning = new Date('2099-05-04T05:00:00Z'); // 07:00 in Tirana
      const afterHalfSeven = new Date('2099-05-04T05:31:00Z'); // 07:31 in Tirana
      await prisma.appointment.create({
        data: {
          id: randomUUID(), tenantId, clientId: companies.b, assignedUserId: users.salesB,
          scheduledAt: new Date('2099-05-04T12:00:00Z'), status: 'SCHEDULED', kind: 'FOLLOW_UP', type: 'CALL',
        },
      });
      const job = new FollowUpDailySummaryJob(queries(), new PrismaNotificationSettingsRepository(prisma), notifications);
      const summaries = () => notificationsOf(users.salesB, 'FOLLOW_UP_DAILY_SUMMARY');

      await job.run(morning);
      expect(await summaries()).toHaveLength(0);

      await job.run(afterHalfSeven);
      const sent = await summaries();
      expect(sent).toHaveLength(1);
      expect(sent[0].params).toMatchObject({ day: '2099-05-04' });
      expect((sent[0].params as any).today).toBeGreaterThanOrEqual(1);

      await job.run(new Date(afterHalfSeven.getTime() + 10 * 60 * 1000));
      expect(await summaries()).toHaveLength(1);
      await prisma.notificationSettings.update({ where: { tenantId }, data: { followUpDailySummaryEnabled: false } });
    });
  });

  describe('lists (FR-SET-05)', () => {
    it('FR-SET-05 a follow-up interval in use cannot be deleted, but can still be deactivated', async () => {
      await schedule('salesA', { clientId: companies.a, intervalDays: 3 }).expect(201);
      const threeDays = await prisma.followUpInterval.findFirstOrThrow({ where: { tenantId, days: 3 } });

      const refused = await as('admin').delete(`/lookups/follow-up-intervals/${threeDays.id}`);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('LOOKUP_ITEM_IN_USE');
      await as('admin').post(`/lookups/follow-up-intervals/${threeDays.id}/deactivate`).expect(200);
      await as('admin').post(`/lookups/follow-up-intervals/${threeDays.id}/reactivate`).expect(200);
    });
  });
});
