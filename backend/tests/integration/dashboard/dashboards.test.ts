import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { instantInZone, dayKeyInZone, dayBoundsInZone } from '../../../src/shared/domain/time/tenantDay';
import { resolvePeriod } from '../../../src/dashboard/domain/PerformancePeriod';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const TZ = 'Europe/Tirane';
const DAY_MS = 86_400_000;

const addDays = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const utcDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const noon = (key: string) => instantInZone(key, 12, 0, TZ);

/**
 * M3 Slice 13: the Sales User and Sales Manager dashboards on a fixed set of data (NFR-ACC-04): the
 * landing dashboard of each role, the scope the server enforces, the period and "as of now" figures, the
 * location filter, the links behind the figures, the empty state and the value rule. Everything is
 * written straight to the database in last month, so the real clock decides only which month that is.
 */
describe('Sales User and Sales Manager dashboards (M3 Slice 13)', () => {
  const tenantId = `t-dash-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-ds-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    reception: uid('reception'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    salesE: uid('salesE'),
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
  const ids = { companyA: randomUUID(), companyB: randomUUID(), area1: randomUUID(), area2: randomUUID(), city1: randomUUID(), city2: randomUUID() };
  const reasons = { price: randomUUID(), competitor: randomUUID() };

  const today = dayKeyInZone(new Date(), TZ);
  const last = resolvePeriod('LAST_MONTH', today);
  const day = (n: number) => addDays(last.from, n);
  const last_ = 'preset=LAST_MONTH';

  const figure = (body: any, key: string) => body.figures.find((item: any) => item.key === key);
  const value = (body: any, key: string) => figure(body, key)?.value;

  const closedDeal = async (input: { owner: string; result: 'WON' | 'LOST'; on: string; value?: string; offerValue?: string; reasonId?: string; clientId?: string }) => {
    const id = randomUUID();
    const closedAt = utcDate(input.on);
    await prisma.deal.create({
      data: {
        id, tenantId, clientId: input.clientId ?? ids.companyA, ownerUserId: input.owner, type: 'NEW_CONTRACT', stageKey: input.result,
        createdByUserId: input.owner, createdAt: new Date(closedAt.getTime() - 10 * DAY_MS), title: `${input.result} ${input.on}`,
        ...(input.result === 'WON'
          ? { wonAt: closedAt, agreedAnnualValue: input.value ?? '100.00' }
          : { lostAt: closedAt, lostReasonId: input.reasonId ?? null, offerAnnualValue: input.offerValue ?? null }),
      } as any,
    });
    await prisma.dealStageHistory.create({ data: { id: randomUUID(), tenantId, dealId: id, toStage: input.result, ownerUserId: input.owner, at: new Date(closedAt.getTime() + 3_600_000) } });
  };
  const openDeal = (owner: string, stageKey: string, offerValue?: string, clientId = ids.companyA) =>
    prisma.deal.create({
      data: { id: randomUUID(), tenantId, clientId, ownerUserId: owner, type: 'NEW_CONTRACT', stageKey, createdByUserId: owner, offerAnnualValue: offerValue ?? null } as any,
    });
  const activity = (userId: string, channel: string, at: Date) =>
    prisma.interaction.create({ data: { id: randomUUID(), tenantId, clientId: ids.companyA, authorUserId: userId, channel, content: 'x', occurredAt: at } as any });
  const followUp = (userId: string, status: string, due: Date) =>
    prisma.appointment.create({
      data: { id: randomUUID(), tenantId, clientId: ids.companyA, assignedUserId: userId, scheduledAt: due, status, kind: 'FOLLOW_UP', type: 'CALL' } as any,
    });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Dashboard tenant', urlSlug: slug, timezone: TZ } });
    const roles = await seedSystemRoles(prisma, tenantId);
    // A role copied from Sales User (FR-RBAC-04) that may not see money.
    const noValueRole = `r-nv-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: noValueRole, tenantId, key: `novalue-${randomUUID()}`, nameSq: 'Pa vlera', nameEn: 'No values', isSystem: false, baseKey: RoleKey.SalesUser,
        permissions: {
          create: ['deals.view', 'calendar.view', 'contracts.validity.view', 'activities.view', 'companies.view'].map((permissionKey) => ({ permissionKey, scope: 'OWN' })),
        },
      },
    });
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test', isActive: true });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.reception, roles[RoleKey.Reception], 'Rea'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.salesE, roles[RoleKey.SalesUser], 'Elira'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cela'),
        user(users.noValue, noValueRole, 'Nora'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    await prisma.area.createMany({ data: [{ id: ids.area1, tenantId, nameSq: 'Tiranë' }, { id: ids.area2, tenantId, nameSq: 'Durrës' }] as any });
    await prisma.city.createMany({
      data: [{ id: ids.city1, tenantId, areaId: ids.area1, nameSq: 'Tiranë' }, { id: ids.city2, tenantId, areaId: ids.area2, nameSq: 'Durrës' }] as any,
    });
    await prisma.lostReason.createMany({
      data: [{ id: reasons.price, tenantId, nameSq: 'Çmimi', nameEn: 'Price' }, { id: reasons.competitor, tenantId, nameSq: 'Konkurrenti', nameEn: 'Competitor' }] as any,
    });
    await prisma.client.createMany({
      data: [
        { id: ids.companyA, name: 'A Wellness', areaId: ids.area1, cityId: ids.city1 },
        { id: ids.companyB, name: 'B Wellness', areaId: ids.area2, cityId: ids.city2 },
      ].map((company) => ({ ...company, tenantId, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.salesA })) as any,
    });

    const A = users.salesA;
    const B = users.salesB;
    // Besa: the §5.3 worked example, 4 won (592.80 + 600.00 + 1,200.00 + 480.00) and 6 lost, in last month.
    await closedDeal({ owner: A, result: 'WON', on: day(10), value: '592.80' });
    await closedDeal({ owner: A, result: 'WON', on: day(11), value: '600.00' });
    await closedDeal({ owner: A, result: 'WON', on: day(12), value: '1200.00' });
    await closedDeal({ owner: A, result: 'WON', on: day(13), value: '480.00', clientId: ids.companyB });
    for (let i = 0; i < 4; i++) await closedDeal({ owner: A, result: 'LOST', on: day(14 + i), reasonId: reasons.price, offerValue: '100.00' });
    for (let i = 0; i < 2; i++) await closedDeal({ owner: A, result: 'LOST', on: day(18 + i), reasonId: reasons.competitor });
    // Dritan: 1 won, 1 lost for the price.
    await closedDeal({ owner: B, result: 'WON', on: day(15), value: '1000.00' });
    await closedDeal({ owner: B, result: 'LOST', on: day(16), reasonId: reasons.price, offerValue: '50.00' });

    // Open deals, as of now: a lead with no offer counts and adds nothing.
    await openDeal(A, 'NEW_LEAD');
    await openDeal(A, 'CONTACTED', '592.80');
    await openDeal(A, 'NEGOTIATION', '1200.00', ids.companyB);
    await openDeal(B, 'NEW_LEAD', '100.00');
    await openDeal(B, 'OFFER_SENT', '300.00');
    // Someone else's open deal in the same workspace: never in the team.
    await openDeal(users.admin, 'NEW_LEAD', '9999.00');

    await activity(A, 'CALL', noon(day(2)));
    await activity(A, 'CALL', noon(day(3)));
    await activity(A, 'VISIT', noon(day(4)));
    await activity(A, 'MEETING', noon(day(5)));
    await activity(A, 'ONLINE_MEETING', noon(day(6)));
    await activity(B, 'EMAIL', noon(day(2)));
    await prisma.quotation.create({ data: { id: randomUUID(), tenantId, clientId: ids.companyA, createdByUserId: A, status: 'SENT', version: 1, createdAt: noon(day(3)), sentAt: noon(day(4)) } as any });
    await prisma.quotation.create({ data: { id: randomUUID(), tenantId, clientId: ids.companyA, createdByUserId: B, status: 'DRAFT', version: 1, createdAt: noon(day(3)) } as any });

    // Follow-ups: Besa has 2 overdue, 1 due later today and 1 in three days; Dritan has 1 overdue.
    const endOfToday = dayBoundsInZone(TZ, 0).end;
    await followUp(A, 'SCHEDULED', new Date(Date.now() - 3 * DAY_MS));
    await followUp(A, 'CONFIRMED', new Date(Date.now() - DAY_MS));
    await followUp(A, 'SCHEDULED', new Date(endOfToday.getTime() - 1000));
    await followUp(A, 'SCHEDULED', new Date(Date.now() + 3 * DAY_MS));
    await followUp(B, 'SCHEDULED', new Date(Date.now() - 2 * DAY_MS));

    // An active contract ending in ten days and an overdue instalment, both Besa's.
    const contractId = randomUUID();
    await prisma.contract.create({
      data: {
        id: contractId, tenantId, clientId: ids.companyA, assignedUserId: A, planName: 'Gold', status: 'ACTIVE', amount: '100.00', billingPeriod: 'MONTHLY',
        startsAt: utcDate(addDays(today, -300)), endsAt: utcDate(addDays(today, 10)), createdByUserId: users.admin,
      } as any,
    });
    await prisma.contractPayment.create({
      data: { id: randomUUID(), tenantId, contractId, periodIndex: 1, dueDate: utcDate(addDays(today, -20)), amount: '100.00', status: 'OVERDUE' } as any,
    });
  }, 90_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-DSH-01: each role lands on the dashboard of its role, a copied role follows its base, and Reception has none', async () => {
    const kind = async (who: Who) => (await as(who).get('/dashboard/home').expect(200)).body.kind;
    expect(await kind('salesA')).toBe('SALES_USER');
    expect(await kind('manager')).toBe('SALES_MANAGER');
    expect(await kind('admin')).toBe('ADMINISTRATOR');
    expect(await kind('ceo')).toBe('CEO');
    expect(await kind('reception')).toBe('RECEPTION');
    expect(await kind('noValue')).toBe('SALES_USER');
    await request(app).get(`/api/${slug}/dashboard/home`).expect(401);
  });

  it('FR-DSH-02, FR-RBAC-23: the Manager total is the sum of the Sales Users figures and leaves out other roles; a foreign request is a 403', async () => {
    const manager = (await as('manager').get(`/dashboard/sales-manager?${last_}`).expect(200)).body;
    const [a, b, e] = await Promise.all((['salesA', 'salesB', 'salesE'] as Who[]).map(async (who) => (await as(who).get(`/dashboard/sales-user?${last_}`).expect(200)).body));
    for (const key of ['dealsWon', 'offersCreated', 'offersSent', 'calls', 'emails', 'visits', 'meetings', 'leads', 'activeDeals', 'followUpsOverdue']) {
      expect(value(manager, key)).toBe(value(a, key) + value(b, key) + value(e, key));
    }
    expect(Number(value(manager, 'salesValue'))).toBe(Number(value(a, 'salesValue')) + Number(value(b, 'salesValue')));
    // The Administrator's own lead is not the team's.
    expect(value(manager, 'leads')).toBe(3);
    expect(value(manager, 'pipelineValue')).toBe('2192.80');

    await as('salesA').get(`/dashboard/sales-user?${last_}&salespersonId=${users.salesB}`).expect(403);
    await as('salesA').get(`/dashboard/sales-manager?${last_}`).expect(403);
    await as('manager').get(`/dashboard/sales-user?${last_}`).expect(403);
    await as('manager').get(`/dashboard/sales-manager?${last_}&salespersonId=${users.admin}`).expect(403);
    // A parameter cannot widen the scope: it is not read at all.
    const widened = (await as('salesA').get(`/dashboard/sales-user?${last_}&scope=ALL`).expect(200)).body;
    expect(value(widened, 'dealsWon')).toBe(4);
  });

  it('FR-DSH-09, NFR-ACC-04: the Sales User sees their own figures, and the §5.3 example 4 won, 6 lost, €2,872.80', async () => {
    const body = (await as('salesA').get(`/dashboard/sales-user?${last_}`).expect(200)).body;
    expect(body.kind).toBe('SALES_USER');
    expect(value(body, 'leads')).toBe(2);
    expect(value(body, 'activeDeals')).toBe(3);
    expect(value(body, 'pipelineValue')).toBe('1792.80');
    expect(body.tables.dealsByStage.filter((row: any) => row.count > 0).map((row: any) => [row.key, row.count])).toEqual([['NEW_LEAD', 1], ['CONTACTED', 1], ['NEGOTIATION', 1]]);
    expect(value(body, 'followUpsOverdue')).toBe(2);
    expect(value(body, 'followUpsDueToday')).toBe(1);
    expect(value(body, 'followUpsDueNext7Days')).toBe(1);
    expect(value(body, 'offersCreated')).toBe(1);
    expect(value(body, 'offersSent')).toBe(1);
    expect(value(body, 'dealsWon')).toBe(4);
    expect(value(body, 'salesValue')).toBe('2872.80');
    expect([value(body, 'calls'), value(body, 'emails'), value(body, 'visits'), value(body, 'meetings')]).toEqual([2, 0, 1, 2]);
    expect(value(body, 'contractsExpiringSoon')).toBe(1);
    expect(value(body, 'overdueInstalments')).toBe(1);
    // Nothing of Dritan's.
    expect(JSON.stringify(body)).not.toContain('Dritan');
  });

  it('FR-DSH-10, NFR-ACC-04: the Manager sees the team per salesperson, the conversion rate, and the lost reasons add up', async () => {
    const body = (await as('manager').get(`/dashboard/sales-manager?${last_}`).expect(200)).body;
    expect(value(body, 'dealsWon')).toBe(5);
    expect(value(body, 'dealsLost')).toBe(7);
    // 5 / 12 = 41.7%, calculated from the counts, not the average of 40.0% and 50.0%.
    expect(value(body, 'conversionRate')).toBe(41.7);
    expect(value(body, 'salesValue')).toBe('3872.80');
    expect(value(body, 'pendingDiscountApprovals')).toBe(0);
    expect(value(body, 'contractsExpiringSoon')).toBe(1);

    const rows = body.tables.perSalesperson;
    const besa = rows.find((row: any) => row.salesperson.id === users.salesA);
    expect([besa.dealsWon, besa.dealsLost, besa.conversionRate, besa.salesValue]).toEqual([4, 6, 40, '2872.80']);
    const dritan = rows.find((row: any) => row.salesperson.id === users.salesB);
    expect([dritan.dealsWon, dritan.dealsLost, dritan.conversionRate]).toEqual([1, 1, 50]);
    expect(rows.reduce((sum: number, row: any) => sum + row.dealsWon + row.dealsLost, 0)).toBe(12);

    const reasonsTable = body.tables.lostReasons;
    expect(reasonsTable.map((row: any) => [row.labelEn, row.count, row.annualValue])).toEqual([
      ['Price', 5, '450.00'],
      ['Competitor', 2, '0.00'],
    ]);
    expect(reasonsTable.reduce((sum: number, row: any) => sum + row.count, 0)).toBe(value(body, 'dealsLost'));
    expect(body.charts.pipeline.reduce((sum: number, point: any) => sum + point.count, 0)).toBe(value(body, 'activeDeals'));
  });

  it('FR-DSH-03: changing the period changes Deals won but not Active deals, which is labelled as of now', async () => {
    const month = (await as('manager').get('/dashboard/sales-manager?preset=THIS_MONTH').expect(200)).body;
    const year = (await as('manager').get('/dashboard/sales-manager?preset=THIS_YEAR').expect(200)).body;
    const lastMonth = (await as('manager').get(`/dashboard/sales-manager?${last_}`).expect(200)).body;
    expect(value(lastMonth, 'dealsWon')).toBe(5);
    expect(value(month, 'dealsWon')).toBe(0);
    // This year covers last month unless last month was in the previous year (January).
    expect(value(year, 'dealsWon')).toBe(last.from.slice(0, 4) === today.slice(0, 4) ? 5 : 0);
    for (const body of [month, year, lastMonth]) {
      expect(value(body, 'activeDeals')).toBe(5);
      expect(figure(body, 'activeDeals').basis).toBe('asOfNow');
      expect(figure(body, 'dealsWon').basis).toBe('period');
    }
    expect(figure(month, 'conversionRate').value).toBeNull();
    expect((await as('manager').get('/dashboard/sales-manager').expect(200)).body.period.from).toBe(resolvePeriod('THIS_MONTH', today).from);
    const todayBody = (await as('manager').get('/dashboard/sales-manager?preset=TODAY').expect(200)).body;
    expect(todayBody.period).toMatchObject({ from: today, to: today });
    await as('manager').get('/dashboard/sales-manager?preset=CUSTOM&from=2026-03-01').expect(400);
  });

  it('FR-DSH-04: the location filter takes predefined Areas and Cities only', async () => {
    const tirane = (await as('manager').get(`/dashboard/sales-manager?${last_}&areaId=${ids.area1}&cityId=${ids.city1}`).expect(200)).body;
    // The 480.00 deal was on a Durrës company.
    expect(value(tirane, 'dealsWon')).toBe(4);
    expect(value(tirane, 'salesValue')).toBe('3392.80');
    expect(value(tirane, 'activeDeals')).toBe(4);
    await as('manager').get(`/dashboard/sales-manager?${last_}&areaId=made-up`).expect(400);
    await as('manager').get(`/dashboard/sales-manager?${last_}&cityId=${ids.city2}&areaId=${ids.area1}`).expect(400);
  });

  it('FR-DSH-05: Overdue follow-ups carries the filters of a list that shows the same items', async () => {
    const body = (await as('salesA').get('/dashboard/sales-user').expect(200)).body;
    const overdue = figure(body, 'followUpsOverdue');
    expect(overdue.link).toEqual({ target: 'FOLLOW_UPS', filters: { overdueOnly: 'true', assignedUserId: users.salesA } });
    const list = await as('salesA').get(`/follow-ups?overdueOnly=true&assignedUserId=${users.salesA}`).expect(200);
    expect(list.body.data.items).toHaveLength(overdue.value);
    // A period figure with no list behind it has no link.
    expect(figure(body, 'dealsWon').link).toBeNull();
  });

  it('FR-DSH-06: a salesperson with nothing yet gets the empty state, and the figures carry their format', async () => {
    const empty = (await as('salesE').get('/dashboard/sales-user').expect(200)).body;
    expect(empty.empty).toBe(true);
    const full = (await as('salesA').get(`/dashboard/sales-user?${last_}`).expect(200)).body;
    expect(full.empty).toBe(false);
    expect(figure(full, 'salesValue').format).toBe('money');
    expect(figure(full, 'dealsWon').format).toBe('count');
  });

  it('FR-DSH-07: the dashboard shows when it was calculated, is not cached, and counts a new activity on the next request', async () => {
    const before = await as('salesA').get(`/dashboard/sales-user?${last_}`).expect(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(Date.now() - new Date(before.body.calculatedAt).getTime()).toBeLessThan(60_000);
    await activity(users.salesA, 'CALL', noon(day(7)));
    const after = (await as('salesA').get(`/dashboard/sales-user?${last_}`).expect(200)).body;
    expect(value(after, 'calls')).toBe(value(before.body, 'calls') + 1);
  });

  it('FR-DSH-08: a role without commercial details gets no value figures and no value fields', async () => {
    const body = (await as('noValue').get(`/dashboard/sales-user?${last_}`).expect(200)).body;
    const keys = body.figures.map((item: any) => item.key);
    expect(keys).toEqual(expect.arrayContaining(['leads', 'activeDeals', 'dealsWon']));
    expect(keys).not.toContain('salesValue');
    expect(keys).not.toContain('pipelineValue');
    // No payments permission either: overdue instalments are absent, not zero.
    expect(keys).not.toContain('overdueInstalments');
    expect(JSON.stringify(body)).not.toMatch(/salesValue|pipelineValue|annualValue/);
  });
});
