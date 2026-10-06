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
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { ContractRenewalReminderJob } from '../../../src/scheduler/jobs/ContractRenewalReminderJob';
import { ContractExpiryJob } from '../../../src/scheduler/jobs/ContractExpiryJob';
import { ExpireContractUseCase } from '../../../src/contracts/application/use-cases/ExpireContractUseCase';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const DAY = 24 * 60 * 60 * 1000;
const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const day = (offset: number, from: Date = todayUtc()) => new Date(from.getTime() + offset * DAY);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const noonOf = (date: Date) => new Date(`${iso(date)}T12:00:00Z`);
const pdf = () => Buffer.from('%PDF-1.4\n% one\n%%EOF');

/**
 * M3 Slice 11: renewal reminders at the configured lead times, once each
 * (FR-REN-01..03, NFR-REL-01), the Renewals screen and its states (FR-REN-05,
 * FR-REN-09), "Not renewing" (FR-REN-08), the contract dates on the calendar
 * (FR-REN-11), and the UAT-7 scenario. Contracts are written straight to the
 * database with fixed dates and the job is run with a moving clock; the list
 * and the calendar are read against the real day, so those contracts are dated
 * from today.
 */
describe('Renewal reminders, Renewals screen and calendar items (M3 Slice 11)', () => {
  const tenantId = `t-reminders-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-rr-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB'), manager: uid('manager'), reception: uid('reception'), ceo: uid('ceo') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
      upload: (path: string, file: Buffer) => auth(request(app).post(`/api/${slug}${path}`)).attach('file', file, { filename: 'signed.pdf', contentType: 'application/pdf' }),
    };
  };
  const company = { A: randomUUID(), B: randomUUID(), C: randomUUID(), D: randomUUID() };

  /** A contract of `clientId`, written directly. `ends` is a date, or a number of days from today. */
  const contract = async (ends: Date | number, extra: Record<string, unknown> = {}, clientId = company.A) => {
    const endsAt = typeof ends === 'number' ? day(ends) : ends;
    const id = randomUUID();
    await prisma.contract.create({
      data: {
        id, tenantId, clientId, planName: 'Gold', status: 'ACTIVE', amount: '49.40', billingPeriod: 'MONTHLY',
        startsAt: day(-365, endsAt), endsAt, createdByUserId: users.admin, assignedUserId: clientId === company.C || clientId === company.D ? users.salesB : users.salesA,
        number: `CTR-2027-${randomUUID().slice(0, 6)}`, ...extra,
      } as any,
    });
    return id;
  };
  const rows = (contractId: string) => prisma.contractReminder.findMany({ where: { contractId }, orderBy: { leadDays: 'desc' } });
  const reminded = async (contractId: string) =>
    (await prisma.notification.findMany({ where: { tenantId, type: 'CONTRACT_EXPIRING', entityType: 'CONTRACT', entityId: contractId } }));
  const setLeadDays = (days: number[]) =>
    prisma.contractSettings.upsert({ where: { tenantId }, update: { reminderLeadDays: days }, create: { tenantId, reminderLeadDays: days } });

  /** Only this tenant: the database is shared with other suites whose contracts must not move. */
  class ThisTenantQueries extends PrismaSchedulerQueries {
    async listTenants() {
      return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
    }
  }
  const realNotifications = () =>
    new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma), undefined, new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster(prisma)));
  const reminderJob = (notifications: NotificationService = realNotifications()) => new ContractRenewalReminderJob(new ThisTenantQueries(prisma), notifications);
  const expiryJob = () =>
    new ContractExpiryJob(new ThisTenantQueries(prisma), new ExpireContractUseCase(new PrismaContractWriteTransaction(prisma)), realNotifications());

  const list = (who: Who, window = '30', extra = '') => as(who).get(`/renewals?window=${window}${extra}`);
  const listed = async (who: Who, window = '30', extra = '') => (await list(who, window, extra).expect(200)).body.data as any[];
  const rowOf = async (who: Who, contractId: string, window = '30') => (await listed(who, window)).find((entry) => entry.contractId === contractId);

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
    await as(who).post(`/offers/${offerId}/mark-sent`, { sentDate: iso(todayUtc()) }).expect(200);
    await as(who).post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    await setLeadDays([60, 30, 7]);
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Reminders tenant', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq', timezone: 'Europe/Tirane' } });
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
        user(users.ceo, roles[RoleKey.Ceo], 'Gentian'),
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
    await prisma.client.createMany({ data: [row(company.A, 'Restorant A', users.salesA), row(company.B, 'Restorant B', users.salesA), row(company.C, 'Restorant C', users.salesB), row(company.D, 'Restorant D', users.salesB)] });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  // ---- Reminders ----------------------------------------------------------------------------------------

  it('FR-REN-02 a contract ending in 30 days tells the salesperson and the Sales Manager once each, with company, number, end date and days remaining', async () => {
    const endsAt = new Date('2027-06-30T00:00:00Z');
    const id = await contract(endsAt);

    await reminderJob().run(noonOf(day(-30, endsAt)));

    const notices = await reminded(id);
    const recipients = notices.map((notice) => notice.recipientUserId);
    // The salesperson, the Sales Manager (Team scope), and the Administrator (contracts.manage at All scope).
    expect(recipients.sort()).toEqual([users.salesA, users.manager, users.admin].sort());
    // Not the CEO (read-only), Reception, nor another Sales User.
    for (const left of [users.ceo, users.reception, users.salesB]) expect(recipients).not.toContain(left);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(notices[0].params).toMatchObject({ clientName: 'Restorant A', planName: 'Gold', endsAt: '2027-06-30', daysRemaining: 30, leadDays: 30 });
    expect((notices[0].params as any).number).toMatch(/^CTR-2027-/);
    expect(notices.every((notice) => notice.actorUserId === null)).toBe(true);

    // Found where a person looks: the notification points at the contract (it opens it with "Start renewal").
    expect(notices[0]).toMatchObject({ entityType: 'CONTRACT', entityId: id });
  });

  it('FR-REN-03, D8 a contract first seen with 25 days left gets the 30-day reminder, the 60-day one is recorded skipped, and the 7-day one goes out later', async () => {
    const endsAt = new Date('2027-07-31T00:00:00Z');
    const id = await contract(endsAt);
    const job = reminderJob();

    await job.run(noonOf(day(-25, endsAt)));
    expect((await rows(id)).map((row) => [row.leadDays, row.state])).toEqual([[60, 'SKIPPED'], [30, 'SENT']]);
    expect(await reminded(id)).not.toHaveLength(0);
    const after30 = (await reminded(id)).length;

    await job.run(noonOf(day(-24, endsAt)));
    expect((await reminded(id)).length).toBe(after30);

    await job.run(noonOf(day(-7, endsAt)));
    expect((await rows(id)).map((row) => [row.leadDays, row.state])).toEqual([[60, 'SKIPPED'], [30, 'SENT'], [7, 'SENT']]);
    expect((await reminded(id)).length).toBe(after30 * 2);
    expect((await reminded(id)).filter((notice) => (notice.params as any).leadDays === 7).length).toBe(after30);
  });

  it('FR-REN-03, NFR-REL-01 run twice on the same day, the second run sends nothing', async () => {
    const endsAt = new Date('2027-08-31T00:00:00Z');
    const id = await contract(endsAt);
    const job = reminderJob();
    const now = noonOf(day(-30, endsAt));

    await job.run(now);
    const sent = (await reminded(id)).length;
    expect(sent).toBeGreaterThan(0);
    await job.run(now);
    await job.run(new Date(now.getTime() + 60 * 60 * 1000));
    expect((await reminded(id)).length).toBe(sent);
    expect(await rows(id)).toHaveLength(2);
  });

  it('FR-REN-03, NFR-REL-01 after a gap in the runs the same final state: each lead time once for each recipient', async () => {
    const endsAt = new Date('2027-09-30T00:00:00Z');
    const id = await contract(endsAt);
    const job = reminderJob();

    await job.run(noonOf(day(-61, endsAt)));
    expect(await rows(id)).toHaveLength(0);
    await job.run(noonOf(day(-60, endsAt)));
    expect((await rows(id)).map((row) => [row.leadDays, row.state])).toEqual([[60, 'SENT']]);

    // The scheduler is down from 59 to 29 days left (a restart, a deploy) and comes back at 28.
    await job.run(noonOf(day(-28, endsAt)));
    await job.run(noonOf(day(-28, endsAt)));
    expect((await rows(id)).map((row) => [row.leadDays, row.state])).toEqual([[60, 'SENT'], [30, 'SENT']]);

    // What daily runs would have given: one notice per recipient per lead time.
    const notices = await reminded(id);
    const recipients = new Set(notices.map((notice) => notice.recipientUserId));
    expect(recipients).toEqual(new Set([users.salesA, users.manager, users.admin]));
    for (const leadDays of [60, 30]) {
      expect(notices.filter((notice) => (notice.params as any).leadDays === leadDays)).toHaveLength(recipients.size);
    }
  });

  it('FR-REN-03 a failed send writes no row and is retried on the next run', async () => {
    const endsAt = new Date('2027-10-31T00:00:00Z');
    const id = await contract(endsAt);
    const notifications = realNotifications();
    const real = notifications.emitStrict.bind(notifications);
    let failing = true;
    jest.spyOn(notifications, 'emitStrict').mockImplementation(async (input) => {
      if (failing && input.entityId === id) throw new Error('mail is down');
      return real(input);
    });
    const job = reminderJob(notifications);
    const now = noonOf(day(-30, endsAt));

    await job.run(now);
    expect(await rows(id)).toHaveLength(0);
    expect(await reminded(id)).toHaveLength(0);

    failing = false;
    await job.run(new Date(now.getTime() + 60 * 60 * 1000));
    expect((await rows(id)).map((row) => row.leadDays)).toEqual([60, 30]);
    expect((await reminded(id)).length).toBeGreaterThan(0);
  });

  it('FR-REN-01 changing the list to 90 and 30 reminds at 90 and 30 for contracts not yet past those points, and records a passed one as skipped', async () => {
    await setLeadDays([90, 30]);
    const endsAt = new Date('2027-11-30T00:00:00Z');
    const job = reminderJob();

    // Seen at 89 days, inside the new 90-day point: reminded at 90, and at 30 later.
    const notYetPast = await contract(endsAt);
    await job.run(noonOf(day(-89, endsAt)));
    expect((await rows(notYetPast)).map((row) => [row.leadDays, row.state])).toEqual([[90, 'SENT']]);

    // First seen at 25 days, long after the 90-day point: 30 goes out and 90 is only recorded, not sent late.
    const alreadyPast = await contract(endsAt);
    await job.run(noonOf(day(-25, endsAt)));
    expect((await rows(alreadyPast)).map((row) => [row.leadDays, row.state])).toEqual([[90, 'SKIPPED'], [30, 'SENT']]);
    expect((await rows(notYetPast)).map((row) => [row.leadDays, row.state])).toEqual([[90, 'SENT'], [30, 'SENT']]);
    expect((await reminded(alreadyPast)).map((notice) => (notice.params as any).leadDays)).not.toContain(90);
    expect((await reminded(notYetPast)).map((notice) => (notice.params as any).leadDays)).toContain(90);
  });

  it('FR-REN-03, FR-REN-08 nothing is sent for a contract marked Not renewing, a Suspended one, one that was renewed, or one that is not Active; a renewal contract starts with none', async () => {
    const endsAt = new Date('2028-01-31T00:00:00Z');
    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    const none = [
      await contract(endsAt, { notRenewingReasonId: reason.id }),
      await contract(endsAt, { status: 'SUSPENDED' }),
      await contract(endsAt, { status: 'DRAFT' }),
      await contract(endsAt, { status: 'CANCELLED' }),
    ];
    const renewed = await contract(endsAt);
    const renewal = await contract(day(365, endsAt), { renewedFromContractId: renewed, status: 'DRAFT' });
    none.push(renewed);

    await reminderJob().run(noonOf(day(-30, endsAt)));

    for (const id of none) {
      expect(await reminded(id)).toHaveLength(0);
      expect(await rows(id)).toHaveLength(0);
    }
    expect(await rows(renewal)).toHaveLength(0);
  });

  it('NFR-REL-01 an Active contract that already ended is left to the expiry job, and "today" follows the workspace day around midnight', async () => {
    const endsAt = new Date('2028-02-29T00:00:00Z');
    const id = await contract(endsAt);
    // 23:30 UTC on 29 Jan is 00:30 on 30 Jan in Tirane (UTC+1): 30 days left there, 31 in UTC.
    await reminderJob().run(new Date('2028-01-29T23:30:00Z'));
    expect((await rows(id)).map((row) => row.leadDays)).toEqual([60, 30]);
    const ended = await contract(new Date('2028-02-01T00:00:00Z'));
    await reminderJob().run(new Date('2028-02-02T10:00:00Z'));
    expect(await reminded(ended)).toHaveLength(0);
  });

  it('M3 migration: the old per-contract marker is gone and a lead time can be recorded once per contract', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'Contract' AND table_schema = current_schema()`;
    expect(columns.map((column) => column.column_name)).not.toContain('expiryNotifiedAt');
    const id = await contract(day(400));
    const row = { tenantId, contractId: id, leadDays: 30, state: 'SENT', sentAt: new Date() };
    await prisma.contractReminder.create({ data: { id: randomUUID(), ...row } });
    await expect(prisma.contractReminder.create({ data: { id: randomUUID(), ...row } })).rejects.toMatchObject({ code: 'P2002' });
  });

  // ---- Renewals screen ----------------------------------------------------------------------------------

  it('FR-REN-05 lists valid contracts ending in the next 30, 60 or 90 days, soonest first, with end date, days remaining, salesperson, monthly price and state', async () => {
    const in10 = await contract(10);
    const in45 = await contract(45);
    const in80 = await contract(80);
    const in120 = await contract(120);
    const endedYesterday = await contract(-1);

    const ids = async (window: string) => (await listed('admin', window)).map((entry) => entry.contractId);
    const thirty = await ids('30');
    expect(thirty).toContain(in10);
    for (const other of [in45, in80, in120, endedYesterday]) expect(thirty).not.toContain(other);
    const sixty = await ids('60');
    expect(sixty).toEqual(expect.arrayContaining([in10, in45]));
    expect(sixty.indexOf(in10)).toBeLessThan(sixty.indexOf(in45));
    expect(await ids('90')).toEqual(expect.arrayContaining([in10, in45, in80]));
    expect(await ids('90')).not.toContain(in120);

    const row = await rowOf('admin', in10);
    expect(row).toMatchObject({
      status: 'ACTIVE', endsAt: iso(day(10)), daysRemaining: 10, state: 'NOT_STARTED', monthlyPrice: '49.40', planName: 'Gold',
      salesperson: { id: users.salesA, name: 'Besa Test' }, company: { id: company.A, name: 'Restorant A' },
    });
    expect(row.actions).toEqual(['START_RENEWAL', 'MARK_NOT_RENEWING']);
  });

  it('FR-REN-05 a Sales User sees only own contracts, the Sales Manager the team\'s, the CEO and the Administrator all', async () => {
    const own = await contract(5);
    const colleagues = await contract(5, {}, company.C);

    const idsOf = async (who: Who) => (await listed(who)).map((entry) => entry.contractId);
    expect(await idsOf('salesA')).toEqual(expect.arrayContaining([own]));
    expect(await idsOf('salesA')).not.toContain(colleagues);
    expect(await idsOf('salesB')).toContain(colleagues);
    expect(await idsOf('salesB')).not.toContain(own);
    for (const who of ['manager', 'admin', 'ceo'] as Who[]) expect(await idsOf(who)).toEqual(expect.arrayContaining([own, colleagues]));
    // The total counts exactly what the viewer may see.
    const total = (who: Who) => list(who).then((res) => res.body.count as number);
    expect(await total('salesA')).toBeLessThan(await total('admin'));
  });

  it('FR-REN-05 shows Not started, In negotiation (with the deal), Renewed and Not renewing', async () => {
    const notStarted = await contract(12);
    const inNegotiation = await contract(13);
    const renewed = await contract(14);
    const notRenewing = await contract(15);

    const dealId = (await as('salesA').post(`/contracts/${inNegotiation}/renewal`).expect(201)).body.dealId as string;
    await contract(day(379), { renewedFromContractId: renewed, status: 'DRAFT' });
    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    await as('salesA').post(`/contracts/${notRenewing}/not-renewing`, { reasonId: reason.id, note: 'Closing down' }).expect(204);

    expect(await rowOf('salesA', notStarted)).toMatchObject({ state: 'NOT_STARTED', openDealId: null });
    const negotiating = await rowOf('salesA', inNegotiation);
    expect(negotiating).toMatchObject({ state: 'IN_NEGOTIATION', openDealId: dealId });
    expect(negotiating.actions).toEqual([]);
    expect(await rowOf('salesA', renewed)).toMatchObject({ state: 'RENEWED' });
    expect((await rowOf('salesA', renewed)).renewedInto.number).toMatch(/^CTR-2027-/);
    const marked = await rowOf('salesA', notRenewing);
    expect(marked).toMatchObject({ state: 'NOT_RENEWING', notRenewing: { reasonId: reason.id, reasonSq: reason.nameSq, note: 'Closing down' } });
    expect(marked.actions).toEqual(['UNDO_NOT_RENEWING']);
  });

  it('FR-REN-09 an Expired contract is under Recently expired for 90 days and then not', async () => {
    const lastWeek = await contract(-7, { status: 'EXPIRED' });
    const edge = await contract(-90, { status: 'EXPIRED' });
    const tooOld = await contract(-91, { status: 'EXPIRED' });
    const stillActive = await contract(-3);

    const expired = (await listed('admin', 'RECENTLY_EXPIRED')).map((entry) => entry.contractId);
    expect(expired).toEqual(expect.arrayContaining([lastWeek, edge]));
    expect(expired).not.toContain(tooOld);
    // Most recently ended first; an Active contract past its end is the expiry job's, not listed here.
    expect(expired.indexOf(lastWeek)).toBeLessThan(expired.indexOf(edge));
    expect(expired).not.toContain(stillActive);
    expect(await rowOf('salesA', lastWeek, 'RECENTLY_EXPIRED')).toMatchObject({ status: 'EXPIRED', state: 'NOT_STARTED', daysRemaining: -7 });
  });

  it('FR-REN-05 filters by salesperson and by company or number, and pages the list', async () => {
    const a = await contract(20);
    await contract(21, {}, company.C);
    const mine = (await listed('admin', '30', `&assignedUserId=${users.salesA}`)).map((entry) => entry.contractId);
    expect(mine).toContain(a);
    expect(await listed('admin', '30', `&assignedUserId=${users.salesB}`)).not.toEqual(expect.arrayContaining([expect.objectContaining({ contractId: a })]));
    expect((await listed('admin', '30', '&query=Restorant%20C')).every((entry) => entry.company.id === company.C)).toBe(true);

    const first = (await list('admin', '90', '&limit=2&page=1').expect(200)).body;
    const second = (await list('admin', '90', '&limit=2&page=2').expect(200)).body;
    expect(first.data).toHaveLength(2);
    expect(first.count).toBeGreaterThan(2);
    expect(second.data.map((entry: any) => entry.contractId)).not.toEqual(expect.arrayContaining(first.data.map((entry: any) => entry.contractId)));
    await list('admin', 'bogus').expect(400);
  });

  it('NFR-SEC-06, FR-RBAC-21 Reception sees the validity of each contract and no salesperson, state, plan, price, deal or reason', async () => {
    const id = await contract(9);
    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    const marked = await contract(9, { notRenewingReasonId: reason.id, notRenewingNote: 'private' });

    const res = await list('reception').expect(200);
    const row = res.body.data.find((entry: any) => entry.contractId === id);
    expect(row).toEqual({ contractId: id, number: expect.any(String), status: 'ACTIVE', company: { id: company.A, name: 'Restorant A' }, startsAt: expect.any(String), endsAt: iso(day(9)), daysRemaining: 9 });
    expectNoCommercialFields(res.body);
    expect(JSON.stringify(res.body)).not.toContain('private');
    expect(res.body.data.find((entry: any) => entry.contractId === marked).state).toBeUndefined();

    // The CEO reads the money and the states, but acts on nothing.
    const ceoRow = await rowOf('ceo', id);
    expect(ceoRow).toMatchObject({ monthlyPrice: '49.40', state: 'NOT_STARTED', actions: [] });
  });

  // ---- Not renewing -------------------------------------------------------------------------------------

  it('FR-REN-08 marking a contract Not renewing records the reason and note, audits it, stops the reminders, and can be taken back', async () => {
    const endsAt = new Date('2028-03-31T00:00:00Z');
    const id = await contract(endsAt);
    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    const job = reminderJob();

    await job.run(noonOf(day(-30, endsAt)));
    const before = (await reminded(id)).length;
    expect(before).toBeGreaterThan(0);

    await as('salesA').post(`/contracts/${id}/not-renewing`, { reasonId: reason.id, note: '  Moving abroad ' }).expect(204);
    expect(await prisma.contract.findUniqueOrThrow({ where: { id } })).toMatchObject({ notRenewingReasonId: reason.id, notRenewingNote: 'Moving abroad' });
    const audit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: id, action: 'UPDATE' } });
    expect(JSON.stringify(audit.map((entry) => entry.changes))).toContain('notRenewingReasonId');

    // The 7-day reminder does not go out.
    await job.run(noonOf(day(-7, endsAt)));
    expect((await reminded(id)).length).toBe(before);
    expect((await rows(id)).map((row) => row.leadDays)).not.toContain(7);

    // Starting a renewal is refused while it is marked, and allowed once it is taken back.
    expect((await as('salesA').post(`/contracts/${id}/renewal`).expect(409)).body.code).toBe('NOT_RENEWING');
    await as('salesA').delete(`/contracts/${id}/not-renewing`).expect(204);
    expect(await prisma.contract.findUniqueOrThrow({ where: { id } })).toMatchObject({ notRenewingReasonId: null, notRenewingNote: null });
    await job.run(noonOf(day(-7, endsAt)));
    expect((await rows(id)).map((row) => row.leadDays)).toContain(7);
    await as('salesA').post(`/contracts/${id}/renewal`).expect(201);
  });

  it('FR-REN-08 the reason must be an active lost-deal reason of the workspace; another salesperson\'s contract is not found; Reception cannot', async () => {
    const id = await contract(40);
    const inactive = await prisma.lostReason.create({ data: { id: randomUUID(), tenantId, nameSq: 'Pa aktiv', active: false } });
    const active = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });

    await as('salesA').post(`/contracts/${id}/not-renewing`, { reasonId: inactive.id }).expect(400);
    await as('salesA').post(`/contracts/${id}/not-renewing`, { reasonId: 'nope' }).expect(400);
    await as('salesA').post(`/contracts/${id}/not-renewing`, {}).expect(400);
    await as('salesB').post(`/contracts/${id}/not-renewing`, { reasonId: active.id }).expect(404);
    await as('reception').post(`/contracts/${id}/not-renewing`, { reasonId: active.id }).expect(403);
    await as('ceo').post(`/contracts/${id}/not-renewing`, { reasonId: active.id }).expect(403);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id } })).notRenewingReasonId).toBeNull();
  });

  it('FR-REN-08 is refused for a Draft, a renewed contract, and one with an open renewal deal', async () => {
    const reason = await prisma.lostReason.findFirstOrThrow({ where: { tenantId, active: true } });
    const draft = await contract(60, { status: 'DRAFT' });
    await as('salesA').post(`/contracts/${draft}/not-renewing`, { reasonId: reason.id }).expect(400);

    const renewed = await contract(61);
    await contract(day(426), { renewedFromContractId: renewed, status: 'DRAFT' });
    expect((await as('salesA').post(`/contracts/${renewed}/not-renewing`, { reasonId: reason.id }).expect(409)).body.code).toBe('ALREADY_RENEWED');

    const negotiating = await contract(62);
    await as('salesA').post(`/contracts/${negotiating}/renewal`).expect(201);
    expect((await as('salesA').post(`/contracts/${negotiating}/not-renewing`, { reasonId: reason.id }).expect(409)).body.code).toBe('RENEWAL_OPEN');
  });

  // ---- Calendar -----------------------------------------------------------------------------------------

  it('FR-REN-11 a contract ending on 28 February shows on that day for its salesperson and for the manager, not for another Sales User, and cannot be changed', async () => {
    const endsAt = new Date('2027-02-28T00:00:00Z');
    const id = await contract(endsAt, { renewalDate: new Date('2027-02-10') });
    const feed = async (who: Who, extra = '') =>
      (await as(who).get(`/calendar?from=2027-01-31T23:00:00.000Z&to=2027-02-28T23:00:00.000Z${extra}`).expect(200)).body.data;
    const items = (data: any) => data.contractItems.filter((item: any) => item.contractId === id);

    const mine = items(await feed('salesA'));
    expect(mine).toEqual([
      expect.objectContaining({ id: `${id}:RENEWAL`, kind: 'CONTRACT_RENEWAL', date: '2027-02-10', companyName: 'Restorant A', assignedUserId: users.salesA }),
      expect.objectContaining({ id: `${id}:END`, kind: 'CONTRACT_END', date: '2027-02-28', contractId: id, number: expect.stringMatching(/^CTR-2027-/), assignedUserName: 'Besa Test' }),
    ]);
    expect(items(await feed('salesB'))).toEqual([]);
    expect(items(await feed('manager'))).toHaveLength(2);
    expect(items(await feed('ceo'))).toHaveLength(2);
    // Not an appointment: it is a separate list, so it cannot be moved, completed or cancelled.
    expect((await feed('salesA')).items.map((item: any) => item.id)).not.toContain(`${id}:END`);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id } })).endsAt).toEqual(endsAt);

    // The day before and after are outside the range: 1 March is not in it.
    const march = await as('salesA').get('/calendar?from=2027-02-28T23:00:00.000Z&to=2027-03-31T22:00:00.000Z').expect(200);
    expect(march.body.data.contractItems.filter((item: any) => item.contractId === id)).toEqual([]);

    // The kinds filter chooses between the two kinds and the appointments.
    const onlyEnd = items(await feed('salesA', '&kinds=CONTRACT_END'));
    expect(onlyEnd.map((item: any) => item.kind)).toEqual(['CONTRACT_END']);
    expect(items(await feed('salesA', '&kinds=FOLLOW_UP'))).toEqual([]);
    expect(items(await feed('salesA', '&types=CALL'))).toEqual([]);
    expect(items(await feed('salesA', `&userIds=${users.salesB}`))).toEqual([]);
    expect(items(await feed('manager', `&userIds=${users.salesA}`))).toHaveLength(2);
  });

  it('FR-REN-11 a contract that is not in force (Draft, Pending Signature, Cancelled) has no date on the calendar', async () => {
    const endsAt = new Date('2027-04-15T00:00:00Z');
    const ids = {
      draft: await contract(endsAt, { status: 'DRAFT' }),
      pending: await contract(endsAt, { status: 'PENDING_SIGNATURE' }),
      cancelled: await contract(endsAt, { status: 'CANCELLED' }),
      suspended: await contract(endsAt, { status: 'SUSPENDED' }),
      expired: await contract(endsAt, { status: 'EXPIRED' }),
    };
    const data = (await as('admin').get('/calendar?from=2027-04-14T22:00:00.000Z&to=2027-04-15T22:00:00.000Z').expect(200)).body.data;
    const shown = data.contractItems.map((item: any) => item.contractId);
    expect(shown).toEqual(expect.arrayContaining([ids.suspended, ids.expired]));
    for (const hidden of [ids.draft, ids.pending, ids.cancelled]) expect(shown).not.toContain(hidden);
  });

  it('FR-REN-11, NFR-SEC-06 Reception has no calendar, so no contract dates', async () => {
    await as('reception').get('/calendar?from=2027-02-01T00:00:00.000Z&to=2027-03-01T00:00:00.000Z').expect(403);
  });

  // ---- UAT-7 --------------------------------------------------------------------------------------------

  it('UAT-7 steps 1 to 3: the 30-day reminder goes out once, the renewal is started and won, the old contract expires by the system and the company stays Client', async () => {
    const endsAt = new Date('2028-05-31T00:00:00Z');
    const id = await contract(endsAt, { startsAt: new Date('2027-06-01T00:00:00Z') }, company.B);
    const job = reminderJob();

    // Step 1: 30 days before the end, the salesperson and the Sales Manager are told, once.
    await job.run(noonOf(day(-30, endsAt)));
    await job.run(noonOf(day(-30, endsAt)));
    const recipients = (await reminded(id)).map((notice) => notice.recipientUserId);
    expect(recipients).toEqual(expect.arrayContaining([users.salesA, users.manager]));
    expect(new Set(recipients).size).toBe(recipients.length);

    // Step 2: the salesperson starts the renewal from the contract and wins it with the Milestone 2 flow.
    const dealId = (await as('salesA').post(`/contracts/${id}/renewal`).expect(201)).body.dealId as string;
    await win(dealId);
    const renewal = (await as('salesA').post('/contracts', { dealId }).expect(201)).body;
    expect(renewal).toMatchObject({ renewedFromContractId: id, startsAt: `${iso(day(1, endsAt))}T00:00:00.000Z` });
    // The new term starts with no reminder rows, and the old one is unchanged.
    expect(await rows(renewal.id)).toHaveLength(0);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
    await as('salesA').upload(`/contracts/${renewal.id}/document`, pdf()).expect(200);
    await as('salesA').post(`/contracts/${renewal.id}/status`, { status: 'ACTIVE' }).expect(200);

    // Step 3: the day after the end date the system expires the old contract; the company is still a Client.
    await expiryJob().run(noonOf(day(1, endsAt)));
    expect(await prisma.contract.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'EXPIRED' });
    expect(await prisma.contractStatusHistory.findFirstOrThrow({ where: { contractId: id, toStatus: 'EXPIRED' } })).toMatchObject({ changedByUserId: null });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: company.B } })).status).toBe('CLIENT');
    // Told nobody "expired": a renewal exists.
    expect(await prisma.notification.count({ where: { tenantId, type: 'CONTRACT_EXPIRED', entityId: id } })).toBe(0);

    // The old contract names the one that renewed it.
    const renewedTerm = await prisma.contract.findUniqueOrThrow({ where: { id }, select: { renewedInto: { select: { id: true } } } });
    expect(renewedTerm.renewedInto?.id).toBe(renewal.id);
  });

  it('FR-CON-17, FR-REN-09 with no renewal the company becomes a Former client when its only contract expires, and the contract stays on the Recently expired tab', async () => {
    const id = await contract(-8, {}, company.D);

    await expiryJob().run(noonOf(day(-6)));

    expect((await prisma.contract.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await prisma.client.findUniqueOrThrow({ where: { id: company.D } })).status).toBe('FORMER_CLIENT');
    expect(await rowOf('salesB', id, 'RECENTLY_EXPIRED')).toMatchObject({ status: 'EXPIRED', state: 'NOT_STARTED', daysRemaining: -8 });
  });
});
