import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { instantInZone, dayKeyInZone } from '../../../src/shared/domain/time/tenantDay';
import { resolvePeriod } from '../../../src/dashboard/domain/PerformancePeriod';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const TZ = 'Europe/Tirane';

const addDays = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const utcDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
/** Noon in the workspace on a day: safely inside it whatever the clock change. */
const noon = (key: string) => instantInZone(key, 12, 0, TZ);

/**
 * M3 Slice 12: the Performance screen on a fixed set of data (NFR-ACC-04): the fourteen indicators of
 * SRS §6.2 per salesperson and in the total row, the scope of each role, the value rule, the drill-down,
 * the series, the exports and their audit entries. Everything is written straight to the database, in
 * last month, so the real clock decides only which month "Last month" is.
 */
describe('Performance screen (M3 Slice 12)', () => {
  const tenantId = `t-perf-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-pf-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    reception: uid('reception'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    salesC: uid('salesC'),
    salesD: uid('salesD'),
    manager: uid('manager'),
    ceo: uid('ceo'),
    noValue: uid('novalue'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return { get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)) };
  };
  const company = { A: randomUUID(), B: randomUUID(), C: randomUUID() };

  const today = dayKeyInZone(new Date(), TZ);
  const last = resolvePeriod('LAST_MONTH', today);
  const before = resolvePeriod('LAST_MONTH', last.from); // the month before last month
  const day = (n: number) => addDays(last.from, n);
  const lastDay = last.to;
  const query = `preset=LAST_MONTH`;

  const activity = (userId: string, channel: string, clientId: string, at: Date) =>
    prisma.interaction.create({
      data: { id: randomUUID(), tenantId, clientId, authorUserId: userId, channel, content: `${channel} note`, occurredAt: at } as any,
    });

  /** A closed deal with its history row: the owner on the row is who had it at the time (D13). */
  const closedDeal = async (input: {
    owner: string;
    result: 'WON' | 'LOST';
    on: string;
    value?: string;
    daysOpen?: number;
    clientId?: string;
    currentOwner?: string;
    extraHistory?: { toStage: string; owner: string; at: Date }[];
  }) => {
    const id = randomUUID();
    const closedAt = utcDate(input.on);
    await prisma.deal.create({
      data: {
        id, tenantId, clientId: input.clientId ?? company.A, ownerUserId: input.currentOwner ?? input.owner, type: 'NEW_CONTRACT',
        stageKey: input.result, createdByUserId: input.owner, createdAt: new Date(closedAt.getTime() - (input.daysOpen ?? 10) * 86_400_000),
        ...(input.result === 'WON' ? { wonAt: closedAt, agreedAnnualValue: input.value ?? '100.00' } : { lostAt: closedAt }),
        title: `${input.result} ${input.on}`,
      } as any,
    });
    for (const row of [...(input.extraHistory ?? []), { toStage: input.result, owner: input.owner, at: new Date(closedAt.getTime() + 3_600_000) }]) {
      await prisma.dealStageHistory.create({ data: { id: randomUUID(), tenantId, dealId: id, toStage: row.toStage, ownerUserId: row.owner, at: row.at } });
    }
    return id;
  };

  const followUp = (userId: string, input: { status: string; due: Date; completedAt?: Date }) =>
    prisma.appointment.create({
      data: {
        id: randomUUID(), tenantId, clientId: company.A, assignedUserId: userId, scheduledAt: input.due, status: input.status, kind: 'FOLLOW_UP',
        type: 'CALL', completedAt: input.completedAt ?? null,
      } as any,
    });

  const quotation = (userId: string, input: { version?: number; createdAt: Date; sentAt?: Date }) =>
    prisma.quotation.create({
      data: {
        id: randomUUID(), tenantId, clientId: company.A, createdByUserId: userId, status: input.sentAt ? 'SENT' : 'DRAFT', version: input.version ?? 1,
        createdAt: input.createdAt, sentAt: input.sentAt ?? null,
      } as any,
    });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Performance tenant', urlSlug: slug, timezone: TZ } });
    const roles = await seedSystemRoles(prisma, tenantId);
    // Performance for everyone, but no money (FR-PRF-10).
    const noValueRole = `r-nv-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: noValueRole, tenantId, key: `novalue-${randomUUID()}`, nameSq: 'Pa vlera', nameEn: 'No values', isSystem: false, baseKey: RoleKey.Administrator,
        permissions: { create: [{ permissionKey: 'performance.view', scope: 'ALL' }] },
      },
    });
    const user = (id: string, roleId: string, firstName: string, isActive = true) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test', isActive,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.reception, roles[RoleKey.Reception], 'Rea'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        // Deactivated later, with activity in the period: keeps the row (FR-PRF-05).
        user(users.salesC, roles[RoleKey.SalesUser], 'Cani', false),
        // Deactivated and idle: no row.
        user(users.salesD, roles[RoleKey.SalesUser], 'Edi', false),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cela'),
        user(users.noValue, noValueRole, 'Nora'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
    await prisma.client.createMany({
      data: ['A', 'B', 'C'].map((key) => ({
        id: company[key as 'A'], tenantId, name: `${key} Wellness`, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.salesA,
      })) as any,
    });

    // --- Besa (salesA) ---
    const A = users.salesA;
    await activity(A, 'CALL', company.A, noon(day(2)));
    await activity(A, 'CALL', company.A, noon(day(3)));
    await activity(A, 'CALL', company.B, noon(day(4)));
    // 23:30 on the last day, workspace time: still in the month (FR-PRF-05).
    await activity(A, 'CALL', company.C, instantInZone(lastDay, 23, 30, TZ));
    // Just outside on both sides: 23:30 the day before, and 00:30 the day after.
    await activity(A, 'CALL', company.A, instantInZone(addDays(last.from, -1), 23, 30, TZ));
    await activity(A, 'CALL', company.A, instantInZone(addDays(lastDay, 1), 0, 30, TZ));
    await activity(A, 'VISIT', company.A, noon(day(5)));
    await activity(A, 'VISIT', company.C, noon(day(6)));
    await activity(A, 'EMAIL', company.A, noon(day(7)));
    await activity(A, 'MEETING', company.B, noon(day(8)));
    await activity(A, 'ONLINE_MEETING', company.C, noon(day(9)));
    await activity(A, 'NOTE', company.B, noon(day(10)));
    await quotation(A, { createdAt: noon(day(3)), sentAt: noon(day(4)) });
    await quotation(A, { createdAt: noon(day(4)), sentAt: noon(day(20)) });
    await quotation(A, { createdAt: noon(day(5)) });
    await quotation(A, { version: 2, createdAt: noon(day(6)) });
    // Won 4 for 592.80 + 600.00 + 1,200.00 + 480.00 and lost 6 (SRS §5.3), 10 days open.
    await closedDeal({ owner: A, result: 'WON', on: day(10), value: '592.80' });
    await closedDeal({ owner: A, result: 'WON', on: day(11), value: '600.00' });
    await closedDeal({ owner: A, result: 'WON', on: day(12), value: '1200.00' });
    // Handed to Dritan after the win: the result stays with Besa.
    await closedDeal({ owner: A, result: 'WON', on: day(13), value: '480.00', currentOwner: users.salesB });
    for (let i = 0; i < 6; i++) await closedDeal({ owner: A, result: 'LOST', on: day(14 + i) });
    // Lost, then reopened and won again: counts once, as won (the lost row is an older result).
    // (Kept to Dritan below so Besa's figures stay the §5.3 example.)
    // Follow-ups: 3 completed (two on the due day, one late) and 2 open past due.
    await followUp(A, { status: 'COMPLETED', due: noon(day(10)), completedAt: noon(day(10)) });
    await followUp(A, { status: 'COMPLETED', due: noon(day(11)), completedAt: noon(day(11)) });
    await followUp(A, { status: 'COMPLETED', due: noon(day(10)), completedAt: noon(day(12)) });
    await followUp(A, { status: 'SCHEDULED', due: new Date(Date.now() - 3 * 86_400_000) });
    await followUp(A, { status: 'CONFIRMED', due: new Date(Date.now() - 86_400_000) });
    // Open but not yet due: not overdue.
    await followUp(A, { status: 'SCHEDULED', due: new Date(Date.now() + 5 * 86_400_000) });
    // A call in the month before last month, for the comparison (FR-PRF-06): the 23:30 one above.

    // --- Dritan (salesB): 1 won (40 days open) and 1 lost = 50.0% ---
    const B = users.salesB;
    await activity(B, 'CALL', company.B, noon(day(2)));
    await activity(B, 'VISIT', company.A, noon(day(3)));
    await quotation(B, { createdAt: noon(day(3)) });
    await closedDeal({ owner: B, result: 'WON', on: day(15), value: '1000.00', daysOpen: 40, clientId: company.B });
    await closedDeal({ owner: B, result: 'LOST', on: day(16), clientId: company.B });
    // Lost earlier, reopened and won again on day 22 by the latest result: not a loss.
    await closedDeal({
      owner: B, result: 'WON', on: day(22), value: '1.00', daysOpen: 40, clientId: company.B,
      extraHistory: [{ toStage: 'LOST', owner: B, at: noon(day(2)) }],
    });
    // Reopened and still open: no result at all.
    const open = randomUUID();
    await prisma.deal.create({ data: { id: open, tenantId, clientId: company.B, ownerUserId: B, type: 'NEW_CONTRACT', stageKey: 'INTERESTED', createdByUserId: B } as any });
    await prisma.dealStageHistory.create({ data: { id: randomUUID(), tenantId, dealId: open, toStage: 'WON', ownerUserId: B, at: noon(day(5)) } });

    // --- Cani (salesC, deactivated): one call in the month ---
    await activity(users.salesC, 'CALL', company.A, noon(day(5)));
  }, 90_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  const rowOf = (body: any, who: Who) => body.rows.find((row: any) => row.salesperson.id === users[who]);

  it('FR-PRF-01: the Sales Manager sees every Sales User with activity and the total; the CEO sees the same', async () => {
    const manager = await as('manager').get(`/performance?${query}`).expect(200);
    expect(manager.body.rows.map((row: any) => row.salesperson.name)).toEqual(['Besa Test', 'Cani Test', 'Dritan Test']);
    expect(manager.body.total).not.toBeNull();
    expect(manager.body.ownOnly).toBe(false);
    // The filter offers the active salespeople and the deactivated one who has a row, not the idle one.
    expect(manager.body.salespeople.map((person: any) => person.name)).toEqual(['Besa Test', 'Cani Test', 'Dritan Test']);

    const ceo = await as('ceo').get(`/performance?${query}`).expect(200);
    expect(ceo.body).toEqual(manager.body);
  });

  it('FR-PRF-01, FR-RBAC-23: a Sales User sees only their own row, no total, and gets 403 for another salesperson, whatever else the request says', async () => {
    const own = await as('salesA').get(`/performance?${query}`).expect(200);
    expect(own.body.rows.map((row: any) => row.salesperson.id)).toEqual([users.salesA]);
    expect(own.body.total).toBeNull();
    expect(own.body.ownOnly).toBe(true);
    expect(own.body.salespeople.map((person: any) => person.id)).toEqual([users.salesA]);

    await as('salesA').get(`/performance?${query}&salespersonIds=${users.salesB}`).expect(403);
    await as('salesA').get(`/performance?${query}&salespersonIds=${users.salesA},${users.salesB}`).expect(403);
    // A parameter cannot widen the scope: it is not read at all.
    const widened = await as('salesA').get(`/performance?${query}&scope=ALL&ownOnly=false`).expect(200);
    expect(widened.body.rows).toHaveLength(1);
    await as('salesA').get(`/performance/records?${query}&indicator=CALLS&salespersonId=${users.salesB}`).expect(403);
    await as('salesA').get(`/performance/series?salespersonId=${users.salesB}`).expect(403);
    await as('salesA').get(`/performance/export?${query}&salespersonIds=${users.salesB}`).expect(403);
  });

  it('FR-PRF-01, FR-RBAC-23: the Administrator and Reception have no access by default; an outsider id is refused for the Manager too', async () => {
    await as('admin').get(`/performance?${query}`).expect(403);
    await as('reception').get(`/performance?${query}`).expect(403);
    await as('manager').get(`/performance?${query}&salespersonIds=${users.admin}`).expect(403);
  });

  it('FR-PRF-02: one salesperson and Last month shows only that row for that month', async () => {
    const res = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesB}`).expect(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].salesperson.id).toBe(users.salesB);
    expect(res.body.period).toEqual({ from: last.from, to: last.to });
    // Several, comma separated.
    const two = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesA},${users.salesB}`).expect(200);
    expect(two.body.rows.map((row: any) => row.salesperson.id)).toEqual([users.salesA, users.salesB]);
  });

  it('FR-PRF-02: a custom range needs both days, and the default is This month', async () => {
    await as('manager').get('/performance?preset=CUSTOM&from=2026-03-01').expect(400);
    await as('manager').get('/performance?preset=CUSTOM&from=2026-03-09&to=2026-03-01').expect(400);
    const res = await as('manager').get('/performance').expect(200);
    expect(res.body.period.from).toBe(resolvePeriod('THIS_MONTH', today).from);
  });

  it('FR-PRF-03, NFR-ACC-04: all fourteen indicators on a row equal the §6.2 definitions on the fixed data', async () => {
    const res = await as('manager').get(`/performance?${query}`).expect(200);
    const besa = rowOf(res.body, 'salesA').figures;
    expect(besa).toEqual({
      calls: 4, // 3 + the 23:30 one on the last day; not the two just outside, not the note
      emails: 1,
      visits: 2,
      meetings: 2, // a meeting and an online meeting
      companiesContacted: 3, // A, B, C: distinct, and the note's company is not extra
      offersCreated: 3, // first versions only
      offersSent: 2,
      dealsWon: 4,
      dealsLost: 6,
      totalValue: '2872.80',
      conversionRate: 40,
      followUpsCompleted: 3,
      followUpsOnTime: 2,
      onTimeShare: 66.7,
      followUpsOverdue: 2,
      averageTimeToClose: 10,
    });
    const dritan = rowOf(res.body, 'salesB').figures;
    expect(dritan).toMatchObject({ calls: 1, visits: 1, companiesContacted: 2, offersCreated: 1, dealsWon: 2, dealsLost: 1, totalValue: '1001.00', followUpsCompleted: 0, onTimeShare: null, followUpsOverdue: 0 });
    // Won twice by its latest result (the lost row of the reopened deal is older): conversion 2 / 3.
    expect(dritan.conversionRate).toBe(66.7);
    expect(dritan.averageTimeToClose).toBe(40);
  });

  it('FR-PRF-04: the total row comes from the underlying data: 5 ÷ 12 = 41.7%, and the average time to close from the combined deals', async () => {
    const res = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesA}`).expect(200);
    const total = res.body.total.figures;
    expect(total.conversionRate).toBe(40);

    // Besa 4 won and 6 lost (40%), Dritan 1 won and 1 lost (50%): a window that holds only those deals.
    const range = `preset=CUSTOM&from=${day(10)}&to=${day(19)}`;
    const both = await as('manager').get(`/performance?${range}&salespersonIds=${users.salesA},${users.salesB}`).expect(200);
    expect(rowOf(both.body, 'salesA').figures.conversionRate).toBe(40);
    expect(rowOf(both.body, 'salesB').figures.conversionRate).toBe(50);
    const bothTotal = both.body.total.figures;
    expect(bothTotal.dealsWon).toBe(5);
    expect(bothTotal.dealsLost).toBe(7);
    expect(bothTotal.conversionRate).toBe(41.7);
    expect(bothTotal.totalValue).toBe('3872.80');
    // 4 deals open 10 days and 1 open 40 days: 80 ÷ 5 = 16, not the 25 of the two averages.
    expect(bothTotal.averageTimeToClose).toBe(16);
  });

  it('FR-PRF-04: the total counts a company contacted by two salespeople once', async () => {
    const res = await as('manager').get(`/performance?${query}`).expect(200);
    const rows = res.body.rows.map((row: any) => row.figures.companiesContacted);
    expect(rows.reduce((sum: number, n: number) => sum + n, 0)).toBeGreaterThan(res.body.total.figures.companiesContacted);
    expect(res.body.total.figures.companiesContacted).toBe(3);
    expect(res.body.total.figures.calls).toBe(6);
  });

  it('FR-PRF-05: a call at 23:30 on the last day counts in the month and one at 00:30 the next day does not; a deal reassigned after the win stays with the winner', async () => {
    const res = await as('manager').get(`/performance?${query}`).expect(200);
    expect(rowOf(res.body, 'salesA').figures.calls).toBe(4);
    // The 480.00 deal belongs to Dritan now but was won by Besa.
    expect(rowOf(res.body, 'salesA').figures.totalValue).toBe('2872.80');
    expect(rowOf(res.body, 'salesB').figures.totalValue).toBe('1001.00');
    const next = await as('manager').get(`/performance?preset=CUSTOM&from=${addDays(lastDay, 1)}&to=${addDays(lastDay, 1)}&salespersonIds=${users.salesA}`).expect(200);
    expect(next.body.rows[0].figures.calls).toBe(1);
  });

  it('FR-PRF-05: a salesperson deactivated later keeps their row with activity in the period, and one with none has no row', async () => {
    const res = await as('manager').get(`/performance?${query}`).expect(200);
    expect(rowOf(res.body, 'salesC').figures.calls).toBe(1);
    expect(rowOf(res.body, 'salesD')).toBeUndefined();
    const empty = await as('manager').get(`/performance?preset=CUSTOM&from=2020-01-01&to=2020-01-31`).expect(200);
    expect(empty.body.rows.map((row: any) => row.salesperson.id)).not.toContain(users.salesC);
  });

  it('FR-PRF-06: compare shows the change against the previous period, and nothing without it', async () => {
    const plain = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesA}`).expect(200);
    expect(plain.body.rows[0].change).toBeUndefined();

    const res = await as('manager').get(`/performance?${query}&compare=true&salespersonIds=${users.salesA}`).expect(200);
    expect(res.body.period.previous).toEqual({ from: before.from, to: before.to });
    // The previous month holds the 23:30 call of the day before.
    expect(res.body.rows[0].change.calls).toEqual({ delta: 3, direction: 'UP' });
    expect(res.body.rows[0].change.conversionRate).toBeNull();
    expect(res.body.rows[0].change.totalValue).toEqual({ delta: '2872.80', direction: 'UP' });
    expect(res.body.total.change.calls).toEqual({ delta: 3, direction: 'UP' });
  });

  it('FR-PRF-07: clicking "Visits: 2" lists the two visits; deals list their result and value', async () => {
    const visits = await as('manager').get(`/performance/records?${query}&indicator=VISITS&salespersonId=${users.salesA}`).expect(200);
    expect(visits.body.count).toBe(2);
    expect(visits.body.rows.map((row: any) => row.detail)).toEqual(['VISIT', 'VISIT']);
    expect(visits.body.rows.map((row: any) => row.companyName).sort()).toEqual(['A Wellness', 'C Wellness']);

    const meetings = await as('manager').get(`/performance/records?${query}&indicator=MEETINGS&salespersonId=${users.salesA}`).expect(200);
    expect(meetings.body.rows.map((row: any) => row.detail).sort()).toEqual(['MEETING', 'ONLINE_MEETING']);

    const won = await as('manager').get(`/performance/records?${query}&indicator=DEALS_WON&salespersonId=${users.salesA}`).expect(200);
    expect(won.body.count).toBe(4);
    expect(won.body.rows.map((row: any) => row.annualValue).sort()).toEqual(['1200.00', '480.00', '592.80', '600.00']);

    const conversion = await as('manager').get(`/performance/records?${query}&indicator=CONVERSION_RATE&salespersonId=${users.salesA}`).expect(200);
    expect(conversion.body.count).toBe(10);

    const offers = await as('manager').get(`/performance/records?${query}&indicator=OFFERS_CREATED&salespersonId=${users.salesA}`).expect(200);
    expect(offers.body.count).toBe(3);
    const overdue = await as('manager').get(`/performance/records?${query}&indicator=FOLLOW_UPS_OVERDUE&salespersonId=${users.salesA}`).expect(200);
    expect(overdue.body.count).toBe(2);
    const completed = await as('manager').get(`/performance/records?${query}&indicator=FOLLOW_UPS_COMPLETED&salespersonId=${users.salesA}`).expect(200);
    expect(completed.body.count).toBe(3);

    // Every indicator's list is as long as its figure, for every salesperson at once.
    const all = await as('manager').get(`/performance/records?${query}&indicator=CALLS&limit=2&page=2`).expect(200);
    expect(all.body.count).toBe(6);
    expect(all.body.rows).toHaveLength(2);
    await as('manager').get(`/performance/records?${query}&indicator=NOPE`).expect(400);
  });

  it('FR-PRF-07: a Sales User drills into their own records only', async () => {
    const own = await as('salesA').get(`/performance/records?${query}&indicator=CALLS`).expect(200);
    expect(own.body.count).toBe(4);
    expect(new Set(own.body.rows.map((row: any) => row.salesperson.id))).toEqual(new Set([users.salesA]));
  });

  it('FR-PRF-08: the series shows the same numbers as the table, per month and per week', async () => {
    const table = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesA}`).expect(200);
    const month = await as('manager').get(`/performance/series?preset=LAST_MONTH&grain=MONTH&salespersonId=${users.salesA}`).expect(200);
    expect(month.body.points).toHaveLength(1);
    const { followUpsOverdue: _overdue, ...asOfPeriod } = table.body.rows[0].figures;
    expect(month.body.points[0].figures).toEqual(asOfPeriod);

    const weeks = await as('manager').get(`/performance/series?preset=LAST_MONTH&grain=WEEK&salespersonId=${users.salesA}`).expect(200);
    expect(weeks.body.points.length).toBeGreaterThanOrEqual(4);
    const sum = (key: string) => weeks.body.points.reduce((total: number, point: any) => total + point.figures[key], 0);
    expect(sum('calls')).toBe(table.body.rows[0].figures.calls);
    expect(sum('dealsWon')).toBe(4);
    expect(sum('visits')).toBe(2);
    await as('manager').get(`/performance/series?preset=THIS_YEAR&grain=WEEK&salespersonId=${users.salesA}&from=2020-01-01`).expect(200);
    await as('manager').get(`/performance/series?preset=CUSTOM&from=2000-01-01&to=2026-01-01&grain=WEEK&salespersonId=${users.salesA}`).expect(400);
  });

  it('FR-PRF-09, FR-AUD-13: the CSV has the table\'s rows and filters, and each export leaves an audit entry', async () => {
    const before = await prisma.auditEntry.count({ where: { tenantId, entityType: 'Performance' } });
    const table = await as('manager').get(`/performance?${query}&salespersonIds=${users.salesA},${users.salesB}`).expect(200);
    const csv = await as('manager').get(`/performance/export?${query}&salespersonIds=${users.salesA},${users.salesB}&locale=en`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    // Header, the two salespeople and the total.
    expect(lines).toHaveLength(1 + table.body.rows.length + 1);
    expect(lines[0].split(',')[0]).toBe('Salesperson');
    expect(lines[0]).toContain('Total value (€)');
    expect(lines[1].startsWith('Besa Test,4,1,2,2,3,3,2,4,6,2872.80,40,3,2,10')).toBe(true);
    expect(lines[lines.length - 1].startsWith('Total,')).toBe(true);

    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Performance' }, orderBy: { at: 'desc' } });
    expect(entries).toHaveLength(before + 1);
    const changes = (entries[0].changes as any[]).map((c) => [c.field, c.new]);
    expect(Object.fromEntries(changes)).toMatchObject({ format: 'CSV', rows: 2, 'filter.preset': 'LAST_MONTH' });
    expect(entries[0]).toMatchObject({ action: 'EXPORT', userId: users.manager });

    const pdf = await as('manager').get(`/performance/export?${query}&format=pdf`).buffer(true).parse((res, done) => {
      const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => parts.push(chunk));
      res.on('end', () => done(null, Buffer.concat(parts)));
    }).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'Performance' } })).toBe(before + 2);
  });

  it('FR-PRF-10: without commercial.view the response and the export have counts and no money', async () => {
    const res = await as('noValue').get(`/performance?${query}`).expect(200);
    expect(res.body.rows.length).toBe(3);
    expect(rowOf(res.body, 'salesA').figures.dealsWon).toBe(4);
    expect(JSON.stringify(res.body)).not.toContain('totalValue');
    expect(JSON.stringify(res.body)).not.toContain('2872.80');

    const compared = await as('noValue').get(`/performance?${query}&compare=true`).expect(200);
    expect(JSON.stringify(compared.body)).not.toContain('totalValue');

    await as('noValue').get(`/performance/records?${query}&indicator=TOTAL_VALUE`).expect(403);
    const won = await as('noValue').get(`/performance/records?${query}&indicator=DEALS_WON`).expect(200);
    expect(won.body.count).toBe(6);
    expect(JSON.stringify(won.body)).not.toContain('annualValue');

    const series = await as('noValue').get(`/performance/series?preset=LAST_MONTH&grain=MONTH&salespersonId=${users.salesA}`).expect(200);
    expect(JSON.stringify(series.body)).not.toContain('totalValue');

    const csv = await as('noValue').get(`/performance/export?${query}&locale=en`).expect(200);
    expect(csv.text).not.toContain('Total value');
    expect(csv.text).not.toContain('2872.80');
  });
});
