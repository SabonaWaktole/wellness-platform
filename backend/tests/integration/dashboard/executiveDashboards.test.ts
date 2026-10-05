import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { routeTable } from '../../support/routeTable';
import { instantInZone, dayKeyInZone } from '../../../src/shared/domain/time/tenantDay';
import { resolvePeriod } from '../../../src/dashboard/domain/PerformancePeriod';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const TZ = 'Europe/Tirane';
const DAY_MS = 86_400_000;

const addDays = (key: string, days: number) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const utcDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const noon = (key: string) => instantInZone(key, 12, 0, TZ);

/**
 * M3 Slice 14: the Administrator and CEO dashboards on a fixed set of data (NFR-ACC-04). The Administrator
 * sees configuration, people and recent changes and no sales figure; the CEO sees the whole workspace,
 * read only, with contract and payment figures equal to the lists. Everything is written straight to the
 * database in last month, so the real clock decides only which month that is.
 */
describe('Administrator and CEO dashboards (M3 Slice 14)', () => {
  const tenantId = `t-exec-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-ex-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    reception: uid('reception'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    ceo: uid('ceo'),
    gone: uid('gone'),
    noPayments: uid('nopayments'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      put: (path: string) => auth(request(app).put(`/api/${slug}${path}`)),
    };
  };
  const ids = { companyA: randomUUID(), companyB: randomUUID(), companyC: randomUUID(), area: randomUUID(), city1: randomUUID(), city2: randomUUID(), zone: randomUUID() };

  const today = dayKeyInZone(new Date(), TZ);
  const last = resolvePeriod('LAST_MONTH', today);
  const day = (n: number) => addDays(last.from, n);
  const last_ = 'preset=LAST_MONTH';
  const figure = (body: any, key: string) => body.figures.find((item: any) => item.key === key);
  const value = (body: any, key: string) => figure(body, key)?.value;

  const closedDeal = async (owner: string, result: 'WON' | 'LOST', on: string, agreedValue = '100.00') => {
    const id = randomUUID();
    const closedAt = utcDate(on);
    await prisma.deal.create({
      data: {
        id, tenantId, clientId: ids.companyA, ownerUserId: owner, type: 'NEW_CONTRACT', stageKey: result, createdByUserId: owner,
        createdAt: new Date(closedAt.getTime() - 10 * DAY_MS), title: `${result} ${on}`,
        ...(result === 'WON' ? { wonAt: closedAt, agreedAnnualValue: agreedValue } : { lostAt: closedAt }),
      } as any,
    });
    await prisma.dealStageHistory.create({ data: { id: randomUUID(), tenantId, dealId: id, toStage: result, ownerUserId: owner, at: new Date(closedAt.getTime() + 3_600_000) } });
  };
  const openDeal = (owner: string, stageKey: string, offerValue?: string) =>
    prisma.deal.create({
      data: { id: randomUUID(), tenantId, clientId: ids.companyA, ownerUserId: owner, type: 'NEW_CONTRACT', stageKey, createdByUserId: owner, offerAnnualValue: offerValue ?? null } as any,
    });
  const contract = async (status: string, amount: string, annual: string | null, startsIn: number, endsIn: number) => {
    const id = randomUUID();
    await prisma.contract.create({
      data: {
        id, tenantId, clientId: ids.companyA, assignedUserId: users.salesA, planName: 'Gold', status, amount, billingPeriod: 'MONTHLY', agreedAnnualValue: annual,
        startsAt: utcDate(addDays(today, startsIn)), endsAt: utcDate(addDays(today, endsIn)), createdByUserId: users.admin,
      } as any,
    });
    return id;
  };
  const instalment = async (contractId: string, index: number, status: string, amount: string, paidAmount = '0.00') => {
    const id = randomUUID();
    await prisma.contractPayment.create({
      data: { id, tenantId, contractId, periodIndex: index, dueDate: utcDate(addDays(today, -index * 5)), amount, status, paidAmount } as any,
    });
    return id;
  };
  const history = (paymentId: string, amountReceived: string, when: { receivedOn?: string; createdAt: Date }) =>
    prisma.contractPaymentHistory.create({
      data: {
        id: randomUUID(), tenantId, paymentId, fromStatus: 'PAYMENT_PENDING', toStatus: 'PAID', amountReceived,
        receivedOn: when.receivedOn ? utcDate(when.receivedOn) : null, createdAt: when.createdAt,
      } as any,
    });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Executive tenant', urlSlug: slug, timezone: TZ } });
    const roles = await seedSystemRoles(prisma, tenantId);
    // A role copied from the CEO that may not see payments (FR-DSH-08).
    const noPaymentsRole = `r-np-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: noPaymentsRole, tenantId, key: `nopayments-${randomUUID()}`, nameSq: 'Pa pagesa', nameEn: 'No payments', isSystem: false, baseKey: RoleKey.Ceo,
        permissions: {
          create: ['performance.view', 'deals.view', 'calendar.view', 'contracts.validity.view', 'commercial.view', 'companies.view'].map((permissionKey) => ({ permissionKey, scope: 'ALL' })),
        },
      },
    });
    // A role nobody holds (FR-DSH-11).
    await prisma.role.create({ data: { id: `r-spare-${randomUUID()}`, tenantId, key: `spare-${randomUUID()}`, nameSq: 'Rezervë', nameEn: 'Spare', isSystem: false, baseKey: RoleKey.SalesUser } });
    const user = (id: string, roleId: string, firstName: string, isActive = true) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test', isActive });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.reception, roles[RoleKey.Reception], 'Rea'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cela'),
        user(users.gone, roles[RoleKey.SalesUser], 'Gent', false),
        user(users.noPayments, noPaymentsRole, 'Nora'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    // Pricing configuration: one zone covering one of two cities.
    await prisma.area.create({ data: { id: ids.area, tenantId, nameSq: 'Tiranë' } as any });
    await prisma.city.createMany({
      data: [{ id: ids.city1, tenantId, areaId: ids.area, nameSq: 'Tiranë' }, { id: ids.city2, tenantId, areaId: ids.area, nameSq: 'Kamëz' }] as any,
    });
    await prisma.priceZone.create({ data: { id: ids.zone, tenantId, nameSq: 'Zona 1', surchargePercent: '0.00' } as any });
    await prisma.priceZoneCity.create({ data: { zoneId: ids.zone, cityId: ids.city1 } });
    await prisma.employeeBand.createMany({
      data: [
        { id: randomUUID(), tenantId, minEmployees: 1, maxEmployees: 10, baseFee: '10.00', perEmployeeFee: '1.00' },
        { id: randomUUID(), tenantId, minEmployees: 11, maxEmployees: 50, baseFee: '20.00', perEmployeeFee: '1.00', active: false },
      ] as any,
    });
    await prisma.pricingSettings.create({ data: { tenantId, discountCapPercent: '10.00' } as any });

    await prisma.client.createMany({
      data: [
        { id: ids.companyA, name: 'A Wellness', status: 'CLIENT' },
        { id: ids.companyB, name: 'B Wellness', status: 'FORMER_CLIENT' },
        { id: ids.companyC, name: 'C Wellness', status: 'LEAD' },
      ].map((company) => ({ ...company, tenantId, customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.salesA })) as any,
    });

    // Sales in last month: Besa wins 592.80 and 600.00 and loses one, Dritan wins 1,000.00.
    await closedDeal(users.salesA, 'WON', day(10), '592.80');
    await closedDeal(users.salesA, 'WON', day(11), '600.00');
    await closedDeal(users.salesA, 'LOST', day(12));
    await closedDeal(users.salesB, 'WON', day(15), '1000.00');
    // Open pipeline across every owner: a lead with no offer counts and adds nothing.
    await openDeal(users.salesA, 'NEW_LEAD');
    await openDeal(users.salesA, 'NEGOTIATION', '1200.00');
    await openDeal(users.salesB, 'OFFER_SENT', '300.00');
    await openDeal(users.admin, 'CONTACTED', '9999.00');

    // Contracts today: two valid (one ends in 10 days), one suspended, one expired, one Active but already ended.
    await contract('ACTIVE', '100.00', '1200.00', -300, 10);
    const longContract = await contract('ACTIVE', '250.00', '3000.00', -100, 200);
    await contract('SUSPENDED', '999.00', '9999.00', -100, 200);
    await contract('EXPIRED', '80.00', '960.00', -400, -40);
    await contract('ACTIVE', '77.00', '777.00', -400, -5);

    // Instalments: an overdue one, a paid one, a part-paid one, an invoiced one and one not invoiced.
    await instalment(longContract, 1, 'OVERDUE', '100.00');
    const paid = await instalment(longContract, 2, 'PAID', '200.00', '200.00');
    const part = await instalment(longContract, 3, 'PARTIALLY_PAID', '300.00', '100.00');
    await instalment(longContract, 4, 'INVOICE_ISSUED', '150.00');
    await instalment(longContract, 5, 'NOT_INVOICED', '50.00');
    // Money received in last month: 200 + 100, and 300 received then taken back the next day. Outside the period: 999.
    await history(paid, '200.00', { receivedOn: day(5), createdAt: noon(day(5)) });
    await history(part, '100.00', { receivedOn: day(6), createdAt: noon(day(6)) });
    await history(part, '300.00', { receivedOn: day(7), createdAt: noon(day(7)) });
    await history(part, '-300.00', { createdAt: noon(day(8)) });
    await history(paid, '0.00', { receivedOn: day(9), createdAt: noon(day(9)) });
    await history(paid, '999.00', { receivedOn: addDays(last.from, -5), createdAt: noon(addDays(last.from, -5)) });

    // Operational: two overdue follow-ups (anyone's), a pending discount approval and an offer waiting.
    for (const assignee of [users.salesA, users.admin]) {
      await prisma.appointment.create({
        data: { id: randomUUID(), tenantId, clientId: ids.companyA, assignedUserId: assignee, scheduledAt: new Date(Date.now() - 2 * DAY_MS), status: 'SCHEDULED', kind: 'FOLLOW_UP', type: 'CALL' } as any,
      });
    }
    const offer = randomUUID();
    await prisma.quotation.create({ data: { id: offer, tenantId, clientId: ids.companyA, createdByUserId: users.salesA, status: 'SENT', version: 1, sentAt: new Date() } as any });
    await prisma.discountApproval.create({ data: { tenantId, quotationId: offer, requestedByUserId: users.salesA, reason: 'Large client', status: 'PENDING' } as any });
  }, 90_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('Administrator (FR-DSH-11)', () => {
    it('FR-DSH-11: shows the pricing configuration, the users per role and what needs attention, and only the Administrator opens it', async () => {
      const body = (await as('admin').get('/dashboard/administrator').expect(200)).body;
      expect(body.kind).toBe('ADMINISTRATOR');

      const pricing = Object.fromEntries(body.tables.pricing.map((row: any) => [row.key, row]));
      expect(pricing.DISCOUNT_CAP.discountCapPercent).toBe('10.00');
      expect(pricing.EMPLOYEE_BANDS.count).toBe(1); // the inactive band is not counted
      expect(pricing.PRICE_ZONES.count).toBe(1);

      const usage = Object.fromEntries(body.tables.usersPerRole.map((row: any) => [row.key, row]));
      expect(usage[RoleKey.SalesUser]).toMatchObject({ activeUsers: 2, inactiveUsers: 1 });
      expect(value(body, 'inactiveUsers')).toBe(1);
      expect(value(body, 'activeUsers')).toBe(7);

      // Kamëz is in no zone, and the Spare role has no users.
      const attention = Object.fromEntries(body.tables.attention.map((item: any) => [item.key, item]));
      expect(attention.CITY_NO_ZONE).toMatchObject({ count: 1, examples: [{ id: ids.city2, name: 'Kamëz' }] });
      expect(attention.ROLE_NO_USERS.examples.map((role: any) => role.name)).toEqual(['Spare']);

      for (const who of ['ceo', 'manager', 'salesA', 'reception'] as Who[]) await as(who).get('/dashboard/administrator').expect(403);
      await as('admin').get('/dashboard/administrator?areaId=x').expect(400);
    });

    it('FR-DSH-11: changing the discount cap shows in the summary and in recent changes', async () => {
      const before = (await as('admin').get('/dashboard/administrator').expect(200)).body;
      expect(before.tables.pricing.find((row: any) => row.key === 'DISCOUNT_CAP').lastChangedAt).toBeNull();

      await as('admin').put('/pricing/discount-cap').send({ discountCapPercent: '15.00' }).expect(200);

      const after = (await as('admin').get('/dashboard/administrator').expect(200)).body;
      const cap = after.tables.pricing.find((row: any) => row.key === 'DISCOUNT_CAP');
      expect(cap.discountCapPercent).toBe('15.00');
      expect(Date.now() - new Date(cap.lastChangedAt).getTime()).toBeLessThan(60_000);
      expect(after.tables.recentChanges[0]).toMatchObject({ entityType: 'PricingSettings', action: 'UPDATE', userName: expect.stringContaining('Ana') });
      // The entry says what changed and who did it, not the values.
      expect(Object.keys(after.tables.recentChanges[0]).sort()).toEqual(['action', 'at', 'entityLabel', 'entityType', 'id', 'userName']);
      expect(after.tables.recentChanges.length).toBeLessThanOrEqual(20);
    });

    it('FR-DSH-11: carries no sales figure', async () => {
      const body = (await as('admin').get(`/dashboard/administrator?${last_}`).expect(200)).body;
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/salesValue|pipelineValue|annualValue|revenue|monthlyRecurring|totalValue|dealsWon|paidAmount|outstanding|instalment/i);
      expect(body.figures.map((item: any) => item.key).sort()).toEqual(['activeUsers', 'attentionItems', 'inactiveUsers']);
    });
  });

  describe('CEO (FR-DSH-12, FR-DSH-13)', () => {
    let ceo: any;
    beforeAll(async () => {
      ceo = (await as('ceo').get(`/dashboard/ceo?${last_}`).expect(200)).body;
    });

    it('FR-DSH-12: pipeline, sales value and the monthly series of the whole workspace', async () => {
      expect(ceo.kind).toBe('CEO');
      // Every owner's open deals, the Administrator's included.
      expect(value(ceo, 'activeDeals')).toBe(4);
      expect(value(ceo, 'leads')).toBe(2);
      expect(value(ceo, 'pipelineValue')).toBe('11499.00');
      expect(value(ceo, 'salesValue')).toBe('2192.80');

      const span = (await as('ceo').get(`/dashboard/ceo?preset=CUSTOM&from=${resolvePeriod('THIS_MONTH', addDays(last.from, -1)).from}&to=${last.to}`).expect(200)).body;
      expect(span.charts.salesPerMonth.map((point: any) => [point.count, point.annualValue])).toEqual([[0, '0.00'], [3, '2192.80']]);
      expect(value(span, 'salesValue')).toBe('2192.80');
    });

    it('FR-DSH-12: the team table is the Performance screen of the sales team', async () => {
      const performance = (await as('ceo').get(`/performance?${last_}`).expect(200)).body;
      expect(ceo.tables.team).toEqual(performance.rows);
      const besa = ceo.tables.team.find((row: any) => row.salesperson.id === users.salesA);
      expect([besa.figures.dealsWon, besa.figures.dealsLost, besa.figures.totalValue]).toEqual([2, 1, '1192.80']);
    });

    it('FR-DSH-12, NFR-ACC-04: revenue counts a receipt by the date received and nets a reversal; recurring value counts valid contracts only', async () => {
      // 200.00 + 100.00 + 300.00 - 300.00; the 999.00 of the month before is outside the period.
      expect(value(ceo, 'revenue')).toBe('300.00');
      // The suspended, expired and ended contracts are not valid today.
      expect(value(ceo, 'monthlyRecurringValue')).toBe('350.00');
    });

    it('FR-DSH-12: contract figures equal the contract lists for All', async () => {
      const total = async (query: string) => (await as('ceo').get(`/contracts?${query}&limit=1`).expect(200)).body.total;
      const rows = Object.fromEntries(ceo.tables.contracts.map((row: any) => [row.key, row]));
      expect(rows.active).toEqual({ key: 'active', count: await total('validity=VALID'), annualValue: '4200.00' });
      expect(rows.expired).toEqual({ key: 'expired', count: await total('status=EXPIRED'), annualValue: '960.00' });
      expect(rows.expiringSoon).toEqual({ key: 'expiringSoon', count: await total('validity=EXPIRING_SOON'), annualValue: '1200.00' });
      expect([rows.active.count, rows.expired.count, rows.expiringSoon.count]).toEqual([2, 1, 1]);
      expect(value(ceo, 'contractsExpiringSoon')).toBe(1);
    });

    it('FR-DSH-12: payment figures equal the payment list for All, per status', async () => {
      const list = async (query = '') => (await as('ceo').get(`/payments?limit=1${query}`).expect(200)).body;
      for (const row of ceo.tables.payments) {
        const expected = await list(`&status=${row.status}`);
        expect([row.count, row.amount, row.outstanding]).toEqual([expected.total, expected.totals.amount, expected.totals.outstanding]);
      }
      const overdue = ceo.tables.payments.find((row: any) => row.status === 'OVERDUE');
      expect([overdue.count, overdue.amount]).toEqual([1, '100.00']);
      const everything = await list();
      expect(value(ceo, 'paymentsOutstanding')).toBe(everything.totals.outstanding);
      expect(value(ceo, 'paymentsOutstanding')).toBe('500.00');
      expect(value(ceo, 'paymentsOverdue')).toBe(1);
      expect(value(ceo, 'paymentsOverdueAmount')).toBe('100.00');
    });

    it('FR-DSH-12: operational indicators and the company count per status', async () => {
      expect(value(ceo, 'followUpsOverdue')).toBe(2);
      expect(value(ceo, 'pendingDiscountApprovals')).toBe(1);
      expect(value(ceo, 'offersWaiting')).toBe(1);
      expect(Object.fromEntries(ceo.tables.companiesPerStatus.map((row: any) => [row.key, row.count]))).toEqual({ CLIENT: 1, FORMER_CLIENT: 1, LEAD: 1 });
    });

    it('FR-DSH-12: the Wellness+ place is in the response and empty, and the figures are as of now or by the period', async () => {
      expect(ceo.wellnessPlus).toEqual([]);
      expect(figure(ceo, 'salesValue').basis).toBe('period');
      expect(figure(ceo, 'revenue').basis).toBe('period');
      expect(figure(ceo, 'pipelineValue').basis).toBe('asOfNow');
      expect(figure(ceo, 'contractsActive').basis).toBe('asOfNow');
    });

    it('FR-DSH-02: only the CEO opens it, and it cannot be narrowed to a salesperson or a location', async () => {
      for (const who of ['admin', 'manager', 'salesA', 'reception'] as Who[]) await as(who).get('/dashboard/ceo').expect(403);
      await as('ceo').get(`/dashboard/ceo?salespersonId=${users.salesA}`).expect(400);
      await as('ceo').get(`/dashboard/ceo?areaId=${ids.area}`).expect(400);
    });

    it('FR-DSH-08: without Payments: view the payment figures, revenue and overdue amounts are absent, not zero', async () => {
      const body = (await as('noPayments').get(`/dashboard/ceo?${last_}`).expect(200)).body;
      const keys = body.figures.map((item: any) => item.key);
      expect(keys).toEqual(expect.arrayContaining(['activeDeals', 'pipelineValue', 'salesValue', 'contractsActive', 'monthlyRecurringValue']));
      for (const hidden of ['revenue', 'paymentsOutstanding', 'paymentsOverdue', 'paymentsOverdueAmount']) expect(keys).not.toContain(hidden);
      expect(body.tables.payments).toBeUndefined(); // `payments` is a guarded field name
      expect(JSON.stringify(body)).not.toMatch(/paidAmount|outstanding|overdueAmount/);
    });

    it('FR-DSH-13, FR-RBAC-24: the CEO is read only: every route that changes contracts, payments, deals, companies, offers or follow-ups is a 403', async () => {
      const writes = routeTable(createApp()).filter(
        (route) =>
          route.path.startsWith('/api/:tenantSlug/') &&
          route.method !== 'GET' &&
          route.gate.kind === 'permission' &&
          ['contracts.manage', 'contracts.terminate', 'payments.update', 'deals.edit', 'companies.edit', 'followups.manage', 'offers.edit', 'discounts.apply', 'pricing.manage'].includes(route.gate.key)
      );
      expect(writes.length).toBeGreaterThan(20);
      const refused = await Promise.all(
        writes.map(async (route) => {
          const url = route.path.replace(':tenantSlug', slug).replace(/:([A-Za-z]+)/g, () => randomUUID());
          const response = await (request(app) as any)[route.method.toLowerCase()](url).set('Authorization', `Bearer ${tokens.ceo}`).send({});
          return [`${route.method} ${route.path}`, response.status];
        })
      );
      expect(refused.filter(([, status]) => status !== 403)).toEqual([]);
    });

    it('FR-DSH-13: the lists a figure opens carry the filters of the list and no write control comes with them', async () => {
      const overdue = figure(ceo, 'followUpsOverdue');
      expect(overdue.link).toEqual({ target: 'FOLLOW_UPS', filters: { overdueOnly: 'true' } });
      // The list shows the same items, and says the CEO may only look.
      const items = (await as('ceo').get('/follow-ups?overdueOnly=true').expect(200)).body;
      expect(items.data.items).toHaveLength(2);
    });
  });

  it('NFR-ACC-04: the empty workspace shows the empty state to the CEO, not zeros', async () => {
    const empty = `t-exec-empty-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: empty, name: 'Empty', urlSlug: empty, timezone: TZ } });
    try {
      const roles = await seedSystemRoles(prisma, empty);
      const id = uid('emptyceo');
      await prisma.user.create({ data: { id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Ceo], tenantId: empty, firstName: 'Ceo', lastName: 'Empty', isActive: true } });
      const token = tokenService.sign({ userId: id, role: 'STAFF', tenantId: empty, tenantSlug: empty } as any);
      const body = (await request(app).get(`/api/${empty}/dashboard/ceo`).set('Authorization', `Bearer ${token}`).expect(200)).body;
      expect(body.empty).toBe(true);
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(empty);
    }
  });
});
