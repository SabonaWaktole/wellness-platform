import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { instantInZone } from '../../../src/shared/domain/time/tenantDay';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const TIRANE = 'Europe/Tirane';

/**
 * M2 Slice 12 end to end (FR-CAL-01..08, FR-FUP-04, UAT-4): the calendar feed
 * with its overdue list, planning meetings and visits, the team filter, the
 * CEO's read-only access, rescheduling and the workspace time zone.
 */
describe('Sales calendar (M2 Slice 12)', () => {
  const tenantId = `t-calendar-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-cal-${label}-${randomUUID()}`;
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
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
    };
  };

  const companies = { a: randomUUID(), b: randomUUID() };
  const contacts = { a: randomUUID(), b: randomUUID() };
  let dealA: string;

  /** The workspace-zone day `offset` days from today, as YYYY-MM-DD. */
  const dayKey = (offset: number) => {
    const probe = new Date(Date.now() + offset * DAY);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIRANE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(probe);
  };
  const at = (offset: number, hour: number, minute = 0) => instantInZone(dayKey(offset), hour, minute, TIRANE);
  const feed = (who: Who, query: string) => as(who).get(`/calendar?${query}`);
  const window = (fromOffset: number, toOffset: number) =>
    `from=${at(fromOffset, 0).toISOString()}&to=${at(toOffset, 0).toISOString()}`;

  /** A follow-up or planned item written directly, which the API refuses for times in the past. */
  const plant = async (input: {
    assignedUserId: string;
    scheduledAt: Date;
    kind?: 'FOLLOW_UP' | 'PLANNED';
    type?: string;
    status?: string;
    clientId?: string;
    dealId?: string | null;
    endAt?: Date | null;
    place?: string | null;
  }) => {
    const id = randomUUID();
    await prisma.appointment.create({
      data: {
        id,
        tenantId,
        clientId: input.clientId ?? companies.a,
        dealId: input.dealId ?? null,
        assignedUserId: input.assignedUserId,
        scheduledAt: input.scheduledAt,
        endAt: input.endAt ?? null,
        place: input.place ?? null,
        status: input.status ?? 'SCHEDULED',
        kind: input.kind ?? 'PLANNED',
        type: input.type ?? 'MEETING',
      },
    });
    return id;
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Calendar tenant', urlSlug: slug, timezone: TIRANE } });
    const roles = await seedSystemRoles(prisma, tenantId);

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
    const deal = await as('salesA').post('/deals', { clientId: companies.a, type: 'NEW_CONTRACT' });
    expect(deal.status).toBe(201);
    dealA = deal.body.data.id;
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('the feed (FR-CAL-01, 04, FR-FUP-04)', () => {
    it('FR-CAL-01 a follow-up, a meeting and a visit on the same day are returned with their kinds and types', async () => {
      const followUp = (await as('salesA').post('/follow-ups', { clientId: companies.a, dealId: dealA, dueDate: dayKey(3), time: '13:00', type: 'CALL' })).body.data;
      const meeting = await plant({ assignedUserId: users.salesA, scheduledAt: at(3, 11), endAt: at(3, 12), type: 'MEETING' });
      const visit = await plant({ assignedUserId: users.salesA, scheduledAt: at(3, 15), endAt: at(3, 16), type: 'VISIT', place: 'Rruga e Kavajës 12', dealId: dealA });

      const res = await feed('salesA', window(3, 4)).expect(200);
      const items: any[] = res.body.data.items;
      const byId = (id: string) => items.find((item) => item.id === id);

      expect(byId(meeting)).toMatchObject({ kind: 'PLANNED', type: 'MEETING', companyName: 'Kafe Blloku', assignedUserId: users.salesA });
      expect(byId(visit)).toMatchObject({ kind: 'PLANNED', type: 'VISIT', place: 'Rruga e Kavajës 12', dealId: dealA });
      expect(byId(visit).dealTitle ?? byId(visit).dealType).toBeTruthy();
      expect(byId(followUp.id)).toMatchObject({ kind: 'FOLLOW_UP', type: 'CALL', dealId: dealA, scheduledAt: at(3, 13).toISOString() });
      expect(items.every((item) => ['FOLLOW_UP', 'PLANNED'].includes(item.kind))).toBe(true);
    });

    it('FR-CAL-01 kinds and types filter the feed, and a cancelled item is not shown', async () => {
      const cancelled = await plant({ assignedUserId: users.salesA, scheduledAt: at(5, 9), status: 'CANCELLED' });
      const call = await plant({ assignedUserId: users.salesA, scheduledAt: at(5, 10), type: 'CALL' });
      const visit = await plant({ assignedUserId: users.salesA, scheduledAt: at(5, 11), type: 'VISIT' });
      const followUp = await plant({ assignedUserId: users.salesA, scheduledAt: at(5, 12), kind: 'FOLLOW_UP', type: 'CALL' });

      const all = (await feed('salesA', window(5, 6)).expect(200)).body.data.items.map((item: any) => item.id);
      expect(all).toEqual(expect.arrayContaining([call, visit, followUp]));
      expect(all).not.toContain(cancelled);

      const visitsOnly = (await feed('salesA', `${window(5, 6)}&types[]=VISIT`).expect(200)).body.data.items.map((item: any) => item.id);
      expect(visitsOnly).toEqual([visit]);

      const followUpsOnly = (await feed('salesA', `${window(5, 6)}&kinds[]=FOLLOW_UP`).expect(200)).body.data.items.map((item: any) => item.id);
      expect(followUpsOnly).toEqual([followUp]);
    });

    it('FR-CAL-04 a follow-up due last week is in today\'s overdue list, with its company and deal', async () => {
      const lastWeek = await plant({ assignedUserId: users.salesA, scheduledAt: new Date(Date.now() - 7 * DAY), kind: 'FOLLOW_UP', type: 'CALL', dealId: dealA });
      const donePast = await plant({ assignedUserId: users.salesA, scheduledAt: new Date(Date.now() - 6 * DAY), kind: 'FOLLOW_UP', status: 'COMPLETED' });
      const pastMeeting = await plant({ assignedUserId: users.salesA, scheduledAt: new Date(Date.now() - 2 * DAY), type: 'VISIT' });

      const res = await feed('salesA', window(0, 1)).expect(200);
      const overdue: any[] = res.body.data.overdue;
      const ids = overdue.map((item) => item.id);

      expect(ids).toEqual(expect.arrayContaining([lastWeek, pastMeeting]));
      expect(ids).not.toContain(donePast);
      expect(overdue.find((item) => item.id === lastWeek)).toMatchObject({ isOverdue: true, companyName: 'Kafe Blloku', dealId: dealA });
      // Earliest first, so the oldest is at the top of the section.
      expect(ids.indexOf(lastWeek)).toBeLessThan(ids.indexOf(pastMeeting));
      // Overdue items are not repeated in the day's own list.
      expect(res.body.data.items.map((item: any) => item.id)).not.toContain(lastWeek);
    });

    it('FR-FUP-04 a new follow-up is in the calendar feed immediately', async () => {
      const created = await as('salesB').post('/follow-ups', { clientId: companies.b, intervalDays: 7, type: 'CALL' }).expect(201);
      const res = await feed('salesB', window(0, 30)).expect(200);
      expect(res.body.data.items.map((item: any) => item.id)).toContain(created.body.data.id);
    });

    it('rejects a missing, reversed or oversized range', async () => {
      await feed('salesA', '').expect(400);
      await feed('salesA', `from=${at(2, 0).toISOString()}&to=${at(1, 0).toISOString()}`).expect(400);
      await feed('salesA', window(0, 120)).expect(400);
    });
  });

  describe('planning (FR-CAL-02)', () => {
    it('FR-CAL-02 a visit Friday 10:00–11:00 is returned in that slot, with its place, company, deal and contact', async () => {
      const start = at(10, 10);
      const end = at(10, 11);
      const created = await as('salesA')
        .post('/appointments', {
          clientId: companies.a,
          assignedUserId: users.salesA,
          scheduledAt: start.toISOString(),
          endAt: end.toISOString(),
          type: 'VISIT',
          place: 'Kafe Blloku, Rruga Ismail Qemali',
          dealId: dealA,
          contactPersonId: contacts.a,
          notes: 'Show the pricing sheet',
        })
        .expect(201);
      expect(created.body).toMatchObject({ kind: 'PLANNED', type: 'VISIT' });

      const item = (await feed('salesA', window(10, 11)).expect(200)).body.data.items.find((entry: any) => entry.id === created.body.id);
      expect(item).toMatchObject({
        type: 'VISIT',
        scheduledAt: start.toISOString(),
        endAt: end.toISOString(),
        place: 'Kafe Blloku, Rruga Ismail Qemali',
        dealId: dealA,
        contactName: 'Elira Hoxha',
        notes: 'Show the pricing sheet',
      });
    });

    it('FR-CAL-02 an item can be updated: type, end, place, deal and contact', async () => {
      const created = (
        await as('salesA')
          .post('/appointments', { clientId: companies.a, assignedUserId: users.salesA, scheduledAt: at(11, 9).toISOString(), type: 'CALL' })
          .expect(201)
      ).body;
      const updated = await as('salesA')
        .put(`/appointments/${created.id}`, { type: 'ONLINE_MEETING', endAt: at(11, 10).toISOString(), contactPersonId: contacts.a })
        .expect(200);
      expect(updated.body).toMatchObject({ type: 'ONLINE_MEETING', contactPersonId: contacts.a, endAt: at(11, 10).toISOString() });
    });

    it('FR-CAL-02 refuses an end before the start, an unknown type, and a deal or contact of another company', async () => {
      const base = { clientId: companies.a, assignedUserId: users.salesA, scheduledAt: at(12, 10).toISOString() };
      await as('salesA').post('/appointments', { ...base, endAt: at(12, 9).toISOString() }).expect(400);
      await as('salesA').post('/appointments', { ...base, type: 'EMAIL' }).expect(400);
      await as('salesA').post('/appointments', { ...base, type: 'MEETING', place: 'Somewhere' }).expect(400);
      await as('salesA').post('/appointments', { ...base, contactPersonId: contacts.b }).expect(400);
      const dealB = (await as('salesB').post('/deals', { clientId: companies.b, type: 'NEW_CONTRACT' })).body.data.id;
      await as('salesA').post('/appointments', { ...base, dealId: dealB }).expect(400);
    });

    it('FR-CAL-02 a Sales User plans for themselves, not for another salesperson', async () => {
      await as('salesA')
        .post('/appointments', { clientId: companies.a, assignedUserId: users.salesB, scheduledAt: at(12, 10).toISOString(), type: 'MEETING' })
        .expect(403);
    });
  });

  describe('the team (FR-CAL-05, 06)', () => {
    it('FR-CAL-05 selecting two salespeople returns only their items', async () => {
      const mark = `${randomUUID()}`.slice(0, 8);
      const a = await plant({ assignedUserId: users.salesA, scheduledAt: at(15, 9), type: 'MEETING' });
      const b = await plant({ assignedUserId: users.salesB, scheduledAt: at(15, 10), type: 'MEETING', clientId: companies.b });
      const adminOwn = await plant({ assignedUserId: users.admin, scheduledAt: at(15, 11), type: 'MEETING' });
      expect(mark).toBeTruthy();

      const both = (await feed('manager', `${window(15, 16)}&userIds[]=${users.salesA}&userIds[]=${users.salesB}`).expect(200)).body.data.items.map(
        (item: any) => item.id
      );
      expect(both).toEqual(expect.arrayContaining([a, b]));
      expect(both).not.toContain(adminOwn);

      const onlyB = (await feed('manager', `${window(15, 16)}&userIds[]=${users.salesB}`).expect(200)).body.data.items.map((item: any) => item.id);
      expect(onlyB).toEqual([b]);
    });

    it('FR-CAL-05 a Sales User only ever sees their own items, whatever they ask for', async () => {
      const b = await plant({ assignedUserId: users.salesB, scheduledAt: at(16, 9), clientId: companies.b });
      const a = await plant({ assignedUserId: users.salesA, scheduledAt: at(16, 10) });
      const res = await feed('salesA', `${window(16, 17)}&userIds[]=${users.salesB}&userIds[]=${users.salesA}`).expect(200);
      const ids = res.body.data.items.map((item: any) => item.id);
      expect(ids).toContain(a);
      expect(ids).not.toContain(b);
    });

    it('FR-CAL-06 the CEO sees every item, and gets 403 on create and update', async () => {
      const a = await plant({ assignedUserId: users.salesA, scheduledAt: at(17, 9) });
      const b = await plant({ assignedUserId: users.salesB, scheduledAt: at(17, 10), clientId: companies.b });
      const ids = (await feed('ceo', window(17, 18)).expect(200)).body.data.items.map((item: any) => item.id);
      expect(ids).toEqual(expect.arrayContaining([a, b]));

      await as('ceo')
        .post('/appointments', { clientId: companies.a, assignedUserId: users.salesA, scheduledAt: at(17, 12).toISOString(), type: 'MEETING' })
        .expect(403);
      await as('ceo').put(`/appointments/${a}`, { notes: 'x' }).expect(403);
      await as('ceo').put(`/appointments/${a}/reschedule`, { newDate: at(18, 9).toISOString() }).expect(403);
      await as('ceo').put(`/appointments/${a}/cancel`, { reason: 'x' }).expect(403);
      await as('ceo').post('/follow-ups', { clientId: companies.a, intervalDays: 3 }).expect(403);
    });

    it('FR-CAL-06 Reception, who holds no calendar permission, gets 403 on the feed', async () => {
      await feed('reception', window(0, 7)).expect(403);
    });
  });

  describe('rescheduling and time zones (FR-CAL-07, 08)', () => {
    it('FR-CAL-07 rescheduling from 10:00 to 14:00 moves the item and keeps its length', async () => {
      const created = (
        await as('salesA')
          .post('/appointments', {
            clientId: companies.a,
            assignedUserId: users.salesA,
            scheduledAt: at(20, 10).toISOString(),
            endAt: at(20, 11).toISOString(),
            type: 'MEETING',
          })
          .expect(201)
      ).body;

      const moved = await as('salesA').put(`/appointments/${created.id}/reschedule`, { newDate: at(20, 14).toISOString() }).expect(200);
      expect(moved.body.scheduledAt).toBe(at(20, 14).toISOString());
      expect(moved.body.endAt).toBe(at(20, 15).toISOString());

      const item = (await feed('salesA', window(20, 21)).expect(200)).body.data.items.find((entry: any) => entry.id === created.id);
      expect(item).toMatchObject({ scheduledAt: at(20, 14).toISOString(), endAt: at(20, 15).toISOString() });
    });

    it('FR-CAL-07 a new end can be given with the new start', async () => {
      const created = (
        await as('salesA')
          .post('/appointments', { clientId: companies.a, assignedUserId: users.salesA, scheduledAt: at(21, 10).toISOString(), endAt: at(21, 11).toISOString() })
          .expect(201)
      ).body;
      const moved = await as('salesA')
        .put(`/appointments/${created.id}/reschedule`, { newDate: at(21, 13).toISOString(), newEnd: at(21, 15).toISOString() })
        .expect(200);
      expect(moved.body.endAt).toBe(at(21, 15).toISOString());
    });

    it('FR-CAL-07 a cancelled item cannot be rescheduled', async () => {
      const id = await plant({ assignedUserId: users.salesA, scheduledAt: at(22, 10), status: 'CANCELLED' });
      await as('salesA').put(`/appointments/${id}/reschedule`, { newDate: at(22, 14).toISOString() }).expect(400);
    });

    it('FR-CAL-08 an item created at 09:00 Europe/Tirane is returned as that instant for every user', async () => {
      const nineLocal = at(25, 9);
      const created = (
        await as('salesA')
          .post('/appointments', { clientId: companies.a, assignedUserId: users.salesA, scheduledAt: nineLocal.toISOString(), type: 'MEETING' })
          .expect(201)
      ).body;

      for (const who of ['salesA', 'manager', 'ceo', 'admin'] as Who[]) {
        const item = (await feed(who, window(25, 26)).expect(200)).body.data.items.find((entry: any) => entry.id === created.id);
        expect(item.scheduledAt).toBe(nineLocal.toISOString());
        // Rendered in the workspace's zone that is 09:00, in winter and in summer.
        const rendered = new Intl.DateTimeFormat('en-GB', { timeZone: TIRANE, hour: '2-digit', minute: '2-digit', hour12: false }).format(
          new Date(item.scheduledAt)
        );
        expect(rendered).toBe('09:00');
      }
    });

    it('FR-CAL-08 a day\'s range ends at the workspace\'s midnight: an item at 23:30 local belongs to that day only', async () => {
      const late = await plant({ assignedUserId: users.salesA, scheduledAt: at(26, 23, 30) });
      const today = (await feed('salesA', window(26, 27)).expect(200)).body.data.items.map((item: any) => item.id);
      const next = (await feed('salesA', window(27, 28)).expect(200)).body.data.items.map((item: any) => item.id);
      expect(today).toContain(late);
      expect(next).not.toContain(late);
    });
  });

  describe('the reminder (plan: planned items only)', () => {
    it('a follow-up is never picked by the appointment reminder sweep', async () => {
      const queries = new (require('../../../src/scheduler/PrismaSchedulerQueries').PrismaSchedulerQueries)(prisma);
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      const followUp = await plant({ assignedUserId: users.salesA, scheduledAt: soon, kind: 'FOLLOW_UP', type: 'CALL' });
      const planned = await plant({ assignedUserId: users.salesA, scheduledAt: soon, kind: 'PLANNED' });
      const due = (await queries.findAppointmentsDueReminder(tenantId, new Date(), 60)) as { id: string }[];
      expect(due.map((item) => item.id)).toContain(planned);
      expect(due.map((item) => item.id)).not.toContain(followUp);
    });
  });
});
