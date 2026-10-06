import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { MarkPaymentsOverdueJob } from '../../../src/scheduler/jobs/MarkPaymentsOverdueJob';
import { MarkPaymentOverdueUseCase } from '../../../src/contracts/application/use-cases/MarkPaymentOverdueUseCase';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaPermissionHolderDirectory } from '../../../src/notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaTeamRoster } from '../../../src/access/infrastructure/PrismaTeamRoster';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const day = (offset: number) => new Date(todayUtc().getTime() + offset * 24 * 60 * 60 * 1000);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const noonOf = (date: Date) => new Date(`${iso(date)}T12:00:00Z`);

/**
 * M3 Slice 9: the daily job that marks instalments Overdue and tells people once
 * (FR-PAY-09, FR-PAY-13, NFR-REL-01), the Payments overview with its totals and
 * scope (FR-PAY-11), the CSV export and its audit entry (FR-PAY-14, FR-AUD-13),
 * and the UAT-3 scenario. Contracts and instalments are written straight to the
 * database: how they got there is Slices 4, 5 and 8.
 */
describe('Overdue job, Payments overview, notifications and CSV (M3 Slice 9)', () => {
  const tenantId = `t-overdue-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-od-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    finance: uid('finance'),
    figures: uid('figures'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    reception: uid('reception'),
    ceo: uid('ceo'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
    };
  };
  const company = { A: randomUUID(), B: randomUUID(), C: randomUUID() };

  /** Only this tenant: the database is shared with other suites whose instalments must not move. */
  class ThisTenantQueries extends PrismaSchedulerQueries {
    async listTenants() {
      return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
    }
  }
  const realNotifications = () =>
    new NotificationService(
      new PrismaNotificationRepository(prisma),
      new PrismaUserRepository(prisma),
      undefined,
      new PrismaPermissionHolderDirectory(prisma, new PrismaTeamRoster(prisma))
    );
  const jobWith = (notifications: NotificationService = realNotifications()) =>
    new MarkPaymentsOverdueJob(new ThisTenantQueries(prisma), new MarkPaymentOverdueUseCase(new PrismaContractWriteTransaction(prisma)), notifications);

  /** An Active contract with the given instalments: `[status, dueOffsetInDays, amount, paidAmount]`. */
  const contractWith = async (
    clientId: string,
    instalments: [string, number, string?, string?][],
    assignedUserId: string | null = users.salesA
  ) => {
    const id = randomUUID();
    await prisma.contract.create({
      data: {
        id, tenantId, clientId, planName: 'Gold', status: 'ACTIVE', amount: '49.40', billingPeriod: 'MONTHLY',
        startsAt: day(-60), endsAt: day(300), createdByUserId: users.admin, assignedUserId,
        number: `CTR-${randomUUID().slice(0, 6)}`,
      } as any,
    });
    const payments: string[] = [];
    for (const [index, [status, due, amount = '49.40', paid = '0.00']] of instalments.entries()) {
      const paymentId = randomUUID();
      payments.push(paymentId);
      await prisma.contractPayment.create({
        data: {
          id: paymentId, tenantId, contractId: id, periodIndex: index + 1, dueDate: day(due), amount, status, paidAmount: paid,
          invoiceNumber: status === 'NOT_INVOICED' ? null : `INV-${index + 1}`, invoiceDate: status === 'NOT_INVOICED' ? null : day(due - 5),
        },
      });
    }
    return { id, payments };
  };
  const row = (paymentId: string) => prisma.contractPayment.findUniqueOrThrow({ where: { id: paymentId } });
  const history = (paymentId: string) => prisma.contractPaymentHistory.findMany({ where: { paymentId }, orderBy: { createdAt: 'asc' } });
  const audits = (paymentId: string) => prisma.auditEntry.count({ where: { tenantId, entityType: 'ContractPayment', entityId: paymentId } });
  const notices = async (contractId: string, instalment?: number) =>
    (await prisma.notification.findMany({ where: { tenantId, type: 'PAYMENT_OVERDUE', entityType: 'CONTRACT', entityId: contractId } })).filter(
      (n) => instalment === undefined || (n.params as { instalment?: number }).instalment === instalment
    );
  const setGrace = (days: number) =>
    prisma.contractSettings.upsert({ where: { tenantId }, update: { paymentGraceDays: days }, create: { tenantId, paymentGraceDays: days } });

  beforeEach(async () => {
    jest.restoreAllMocks();
    // Only the grace test changes it, and a failure there must not leak into the next test.
    await setGrace(0);
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Overdue tenant', urlSlug: slug, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);

    // A Finance role: records money for every company (FR-PAY-05).
    const financeRole = `r-fin-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: financeRole, tenantId, key: `finance-${randomUUID()}`, nameSq: 'Financa', nameEn: 'Finance', isSystem: false, baseKey: RoleKey.Administrator,
        permissions: {
          create: [
            { permissionKey: 'payments.view', scope: 'ALL' },
            { permissionKey: 'payments.update', scope: null },
            { permissionKey: 'commercial.view', scope: 'ALL' },
            { permissionKey: 'contracts.validity.view', scope: 'ALL' },
          ],
        },
      },
    });
    // Sees instalments but no figures (FR-PAY-12).
    const figuresRole = `r-nofig-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: figuresRole, tenantId, key: `nofig-${randomUUID()}`, nameSq: 'Pa shifra', nameEn: 'No figures', isSystem: false, baseKey: RoleKey.Administrator,
        permissions: { create: [{ permissionKey: 'payments.view', scope: 'ALL' }, { permissionKey: 'contracts.validity.view', scope: 'ALL' }] },
      },
    });

    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.finance, financeRole, 'Fatjon'),
        user(users.figures, figuresRole, 'Gentian'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Rea'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cela'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
    await prisma.client.createMany({
      data: [
        { id: company.A, tenantId, name: 'Alfa Wellness', status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.salesA },
        { id: company.B, tenantId, name: 'Beta Wellness', status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.salesB },
        // Owned by the Administrator, so outside the Sales Manager's team (D12).
        { id: company.C, tenantId, name: 'Gama Wellness', status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: users.admin, assignedUserId: users.admin },
      ] as any,
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-PAY-09: an instalment due yesterday in Payment Pending becomes Overdue by the system; Not Invoiced only carries the flag', async () => {
    const made = await contractWith(company.A, [['PAYMENT_PENDING', -1], ['NOT_INVOICED', -1], ['INVOICE_ISSUED', 0], ['PAID', -5, '49.40', '49.40']]);
    await jobWith().run(new Date());

    expect((await row(made.payments[0])).status).toBe('OVERDUE');
    expect((await row(made.payments[1])).status).toBe('NOT_INVOICED');
    // Due today is not past due; a Paid instalment never changes.
    expect((await row(made.payments[2])).status).toBe('INVOICE_ISSUED');
    expect((await row(made.payments[3])).status).toBe('PAID');

    const entries = await history(made.payments[0]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ fromStatus: 'PAYMENT_PENDING', toStatus: 'OVERDUE', changedByUserId: null });
    expect(await prisma.auditEntry.count({ where: { tenantId, entityType: 'ContractPayment', entityId: made.payments[0], userId: null, userRole: 'SYSTEM', action: 'STATUS_CHANGE' } })).toBe(1);
    expect(await history(made.payments[1])).toHaveLength(0);

    const list = await as('finance').get(`/contracts/${made.id}/payments`).expect(200);
    const flags = Object.fromEntries(list.body.payments.map((p: any) => [p.id, p.dueNotInvoiced]));
    expect(flags[made.payments[1]]).toBe(true);
    expect(flags[made.payments[0]]).toBe(false);
  });

  it('FR-PAY-09, NFR-REL-01: the grace days delay it; twice in a row changes nothing; a run after a two-day gap catches up', async () => {
    const made = await contractWith(company.A, [['PAYMENT_PENDING', -3], ['INVOICE_ISSUED', -4]]);
    await setGrace(3);
    const job = jobWith();

    // Due 3 days ago with 3 grace days: today is the last day of grace. Due 4 days ago is past it.
    await job.run(new Date());
    expect((await row(made.payments[0])).status).toBe('PAYMENT_PENDING');
    expect((await row(made.payments[1])).status).toBe('OVERDUE');

    // Tomorrow the first one is past its grace too.
    await job.run(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect((await row(made.payments[0])).status).toBe('OVERDUE');

    // Twice in a row: no second history row, audit entry or notification.
    const before = { history: (await history(made.payments[1])).length, audits: await audits(made.payments[1]), notices: (await notices(made.id)).length };
    await job.run(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await job.run(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect({ history: (await history(made.payments[1])).length, audits: await audits(made.payments[1]), notices: (await notices(made.id)).length }).toEqual(before);

    // After a gap: nobody ran for days, and one run still finds it.
    const late = await contractWith(company.A, [['PAYMENT_PENDING', 0]]);
    await jobWith().run(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000));
    expect((await row(late.payments[0])).status).toBe('OVERDUE');
    expect(await history(late.payments[0])).toHaveLength(1);
  });

  it('FR-PAY-09, D7: a partly paid, past-due instalment reads Overdue; a further receipt moves it back and the next run flips it again with no second notification', async () => {
    const made = await contractWith(company.A, [['PARTIALLY_PAID', -2, '49.40', '20.00']]);
    const job = jobWith();
    await job.run(new Date());
    expect((await row(made.payments[0])).status).toBe('OVERDUE');
    expect(await notices(made.id)).not.toHaveLength(0);
    const told = (await notices(made.id)).length;

    await as('finance').post(`/contracts/${made.id}/payments/${made.payments[0]}/receipts`, { amount: '10.00', receivedOn: iso(todayUtc()), method: 'CASH' }).expect(201);
    expect((await row(made.payments[0])).status).toBe('PARTIALLY_PAID');

    await job.run(new Date());
    const after = await row(made.payments[0]);
    expect(after.status).toBe('OVERDUE');
    // The label flips; the money does not.
    expect(after.paidAmount.toString()).toBe('30');
    expect((await history(made.payments[0])).filter((h) => h.toStatus === 'OVERDUE')).toHaveLength(2);
    expect(await notices(made.id)).toHaveLength(told);
  });

  it('FR-PAY-13: one notification per overdue instalment to the payment users, the salesperson and the Sales Manager, none on the second run', async () => {
    const made = await contractWith(company.A, [['PAYMENT_PENDING', -1]]);
    const job = jobWith();
    await job.run(new Date());

    const sent = await notices(made.id);
    const recipients = sent.map((n) => n.recipientUserId);
    expect(recipients).toEqual(expect.arrayContaining([users.finance, users.admin, users.salesA, users.manager]));
    // Not Reception, another salesperson, nor roles that only view.
    for (const outsider of [users.reception, users.salesB, users.ceo, users.figures]) expect(recipients).not.toContain(outsider);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(sent.every((n) => n.actorUserId === null)).toBe(true);
    expect(sent[0].params).toMatchObject({ clientName: 'Alfa Wellness', instalment: 1, dueDate: iso(day(-1)) });
    expect((await row(made.payments[0])).overdueNotifiedAt).not.toBeNull();

    await job.run(new Date());
    expect(await notices(made.id)).toHaveLength(sent.length);
  });

  it('FR-PAY-13: a company owned by the Administrator is outside the Sales Manager\'s team and the salesperson is the contract\'s', async () => {
    const made = await contractWith(company.C, [['INVOICE_ISSUED', -1]], users.salesB);
    await jobWith().run(new Date());
    const recipients = (await notices(made.id)).map((n) => n.recipientUserId);
    expect(recipients).toEqual(expect.arrayContaining([users.salesB, users.finance, users.admin]));
    expect(recipients).not.toContain(users.manager);
    expect(recipients).not.toContain(users.salesA);
  });

  it('FR-PAY-13, NFR-REL-01: a failing notification does not undo the change and is retried on the next run, then not again', async () => {
    const made = await contractWith(company.A, [['PAYMENT_PENDING', -1]]);
    const real = realNotifications();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = jest.spyOn(real, 'emitStrict').mockRejectedValueOnce(new Error('mail down'));
    const job = jobWith(real);

    await job.run(new Date());
    expect((await row(made.payments[0])).status).toBe('OVERDUE');
    expect((await row(made.payments[0])).overdueNotifiedAt).toBeNull();
    expect(await notices(made.id)).toHaveLength(0);

    await job.run(new Date());
    const told = await notices(made.id);
    expect(told.length).toBeGreaterThan(0);
    expect((await row(made.payments[0])).overdueNotifiedAt).not.toBeNull();
    expect(await history(made.payments[0])).toHaveLength(1);

    await job.run(new Date());
    expect(failing).toHaveBeenCalledTimes(2);
    expect(await notices(made.id)).toHaveLength(told.length);
  });

  it('NFR-REL-01: a workspace that fails does not stop the others', async () => {
    const other = `t-overdue-other-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: other, name: 'Other', urlSlug: other, timezone: 'UTC' } });
    try {
      class TwoTenants extends PrismaSchedulerQueries {
        async listTenants() {
          return [{ id: other, timeZone: 'UTC' }, { id: tenantId, timeZone: 'UTC' }];
        }
        async getPaymentGraceDays(id: string) {
          if (id === other) throw new Error('boom');
          return super.getPaymentGraceDays(id);
        }
      }
      const made = await contractWith(company.A, [['PAYMENT_PENDING', -1]]);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const summary = await new MarkPaymentsOverdueJob(
        new TwoTenants(prisma),
        new MarkPaymentOverdueUseCase(new PrismaContractWriteTransaction(prisma)),
        realNotifications()
      ).run(new Date());
      expect(summary).toMatch(/1 workspace\(s\) failed/);
      expect((await row(made.payments[0])).status).toBe('OVERDUE');
    } finally {
      await prisma.tenant.delete({ where: { id: other } });
    }
  });

  describe('Payments overview (FR-PAY-11)', () => {
    let a: { id: string; payments: string[] };
    let b: { id: string; payments: string[] };
    let c: { id: string; payments: string[] };

    beforeAll(async () => {
      a = await contractWith(company.A, [['OVERDUE', -40, '100.00', '30.00'], ['PAYMENT_PENDING', 20, '100.00'], ['NOT_INVOICED', -3, '55.50']]);
      b = await contractWith(company.B, [['OVERDUE', -30, '200.00'], ['PAID', -60, '80.00', '80.00']], users.salesB);
      c = await contractWith(company.C, [['OVERDUE', -20, '300.00'], ['WAIVED', -10, '40.00']], users.admin);
    });

    const search = (who: Who, query: string) => as(who).get(`/payments?${query}&limit=100`);
    const sum = (rows: any[], key: string) => rows.reduce((total, r) => total + Math.round(Number(r[key]) * 100), 0) / 100;
    const ours = (rows: any[]) => rows.filter((r) => [a.id, b.id, c.id].includes(r.contract.id));

    it('filters by status, company, contract, salesperson, due range and the "due, not invoiced" flag, with totals of exactly the filtered rows', async () => {
      const overdueOfA = await search('finance', `status=OVERDUE&contractId=${a.id}`).expect(200);
      expect(overdueOfA.body.data.map((r: any) => r.id)).toEqual([a.payments[0]]);
      expect(overdueOfA.body.totals).toEqual({ amount: '100.00', paidAmount: '30.00', outstanding: '70.00' });
      expect(overdueOfA.body.data[0]).toMatchObject({ client: { name: 'Alfa Wellness' }, contract: { id: a.id }, salesperson: { name: 'Besa Test' } });

      const flagged = await search('finance', `dueNotInvoiced=true&clientId=${company.A}`).expect(200);
      expect(flagged.body.data.map((r: any) => r.id)).toContain(a.payments[2]);
      expect(flagged.body.data.every((r: any) => r.status === 'NOT_INVOICED' && r.dueNotInvoiced)).toBe(true);

      const ranged = await search('finance', `contractId=${a.id}&dueFrom=${iso(day(-5))}&dueTo=${iso(day(30))}`).expect(200);
      expect(ranged.body.data.map((r: any) => r.id).sort()).toEqual([a.payments[1], a.payments[2]].sort());
      expect(ranged.body.totals).toEqual({ amount: '155.50', paidAmount: '0.00', outstanding: '155.50' });

      const byPerson = await search('finance', `status=OVERDUE&assignedUserId=${users.salesB}`).expect(200);
      expect(ours(byPerson.body.data).map((r: any) => r.id)).toEqual([b.payments[0]]);

      // Text search on the company's name or the contract's number.
      const byName = await search('finance', 'query=gama').expect(200);
      expect(ours(byName.body.data).map((r: any) => r.id).sort()).toEqual([...c.payments].sort());
      const number = (await prisma.contract.findUniqueOrThrow({ where: { id: b.id } })).number!;
      const byNumber = await search('finance', `query=${number.toLowerCase()}`).expect(200);
      expect(byNumber.body.data.map((r: any) => r.id).sort()).toEqual([...b.payments].sort());

      // A waived instalment is in the list and in the amount but owes nothing.
      const waived = await search('finance', `contractId=${c.id}`).expect(200);
      expect(waived.body.totals).toEqual({ amount: '340.00', paidAmount: '0.00', outstanding: '300.00' });
    });

    it('scope: a Sales User sees Own, the Sales Manager Team, the CEO and authorised payment users All, and totals equal the sum of the rows', async () => {
      const expectations: [Who, string[], string[]][] = [
        ['salesA', [a.payments[0]], [b.payments[0], c.payments[0]]],
        ['salesB', [b.payments[0]], [a.payments[0], c.payments[0]]],
        ['manager', [a.payments[0], b.payments[0]], [c.payments[0]]],
        ['ceo', [a.payments[0], b.payments[0], c.payments[0]], []],
        ['finance', [a.payments[0], b.payments[0], c.payments[0]], []],
      ];
      for (const [who, expected, hidden] of expectations) {
        const res = await search(who, 'status=OVERDUE').expect(200);
        const ids = res.body.data.map((r: any) => r.id);
        expect(ids).toEqual(expect.arrayContaining(expected));
        for (const id of hidden) expect(ids).not.toContain(id);
        expect(res.body.total).toBe(res.body.data.length);
        expect(res.body.totals.amount).toBe(sum(res.body.data, 'amount').toFixed(2));
        expect(res.body.totals.paidAmount).toBe(sum(res.body.data, 'paidAmount').toFixed(2));
        expect(res.body.totals.outstanding).toBe(sum(res.body.data, 'outstanding').toFixed(2));
      }
    });

    it('FR-PAY-12: Reception gets 403; a role without commercial.view sees the rows but no amount and no totals', async () => {
      await as('reception').get('/payments').expect(403);
      await as('reception').get('/payments/export.csv').expect(403);
      const blind = await search('figures', `contractId=${a.id}`).expect(200);
      expect(blind.body.data).toHaveLength(3);
      expect(blind.body.totals).toEqual({});
      expect(JSON.stringify(blind.body)).not.toMatch(/"(amount|paidAmount|outstanding)"/);
    });

    it('pages: total is of the filtered list, not of the page', async () => {
      const page = await as('finance').get(`/payments?contractId=${a.id}&limit=2&page=2`).expect(200);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(page.body.data).toHaveLength(1);
      expect(page.body.totals.amount).toBe('255.50');
    });

    it('rejects a filter it does not know', async () => {
      await search('finance', 'status=SOMETHING').expect(400);
      await search('finance', 'dueFrom=tomorrow').expect(400);
    });
  });

  describe('CSV export (FR-PAY-14, FR-AUD-13)', () => {
    const exportOf = (who: Who, query = '') => as(who).get(`/payments/export.csv${query ? `?${query}` : ''}`);
    const lines = (text: string) => text.replace(/^﻿/, '').trim().split('\r\n');

    it('equals the filtered rows, UTF-8 with BOM, money as plain decimals, and writes one audit entry with the filters', async () => {
      const made = await contractWith(company.A, [['OVERDUE', -9, '1234.50', '34.50'], ['NOT_INVOICED', -1, '10.00']]);
      const before = await prisma.auditEntry.count({ where: { tenantId, action: 'EXPORT' } });

      const res = await exportOf('finance', `contractId=${made.id}`).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('payments-');
      expect(res.text.startsWith('﻿')).toBe(true);

      const rows = lines(res.text);
      expect(rows[0]).toBe('contract,company,salesperson,instalment,dueDate,status,dueNotInvoiced,invoiceNumber,invoiceDate,amount,received,outstanding,receivedOn,method');
      expect(rows).toHaveLength(3);
      const number = (await prisma.contract.findUniqueOrThrow({ where: { id: made.id } })).number;
      expect(rows[1]).toBe(`${number},Alfa Wellness,Besa Test,1,${iso(day(-9))},OVERDUE,no,INV-1,${iso(day(-14))},1234.50,34.50,1200.00,,`);
      expect(rows[2]).toContain(`,2,${iso(day(-1))},NOT_INVOICED,yes,,,10.00,0.00,10.00,,`);

      const entries = await prisma.auditEntry.findMany({ where: { tenantId, action: 'EXPORT' }, orderBy: { at: 'desc' } });
      expect(entries).toHaveLength(before + 1);
      expect(entries[0]).toMatchObject({ userId: users.finance, entityType: 'ContractPayment' });
      expect(entries[0].changes).toEqual(
        expect.arrayContaining([
          { field: 'rows', old: null, new: 2 },
          { field: 'filter.contractId', old: null, new: made.id },
        ])
      );
    });

    it('follows the same scope and columns as the screen: a Sales User exports only own companies, no money without commercial.view', async () => {
      const own = await contractWith(company.A, [['OVERDUE', -2, '20.00']]);
      const foreign = await contractWith(company.B, [['OVERDUE', -2, '20.00']], users.salesB);

      const mine = await exportOf('salesA', 'status=OVERDUE').expect(200);
      const ownNumber = (await prisma.contract.findUniqueOrThrow({ where: { id: own.id } })).number!;
      const foreignNumber = (await prisma.contract.findUniqueOrThrow({ where: { id: foreign.id } })).number!;
      expect(mine.text).toContain(ownNumber);
      expect(mine.text).not.toContain(foreignNumber);

      const blind = await exportOf('figures', `contractId=${own.id}`).expect(200);
      expect(lines(blind.text)[0]).toBe('contract,company,salesperson,instalment,dueDate,status,dueNotInvoiced,invoiceNumber,invoiceDate,receivedOn,method');
      expect(blind.text).not.toContain('20.00');
    });

    it('a contract\'s own instalments export through the contract filter; an unknown filter is refused and not recorded', async () => {
      const made = await contractWith(company.A, [['PAYMENT_PENDING', 5, '49.40']]);
      const before = await prisma.auditEntry.count({ where: { tenantId, action: 'EXPORT' } });
      await exportOf('manager', 'status=NOPE').expect(400);
      expect(await prisma.auditEntry.count({ where: { tenantId, action: 'EXPORT' } })).toBe(before);
      const res = await exportOf('manager', `contractId=${made.id}`).expect(200);
      expect(lines(res.text)).toHaveLength(2);
      expect(await prisma.auditEntry.count({ where: { tenantId, action: 'EXPORT' } })).toBe(before + 1);
    });

    it('a cell that a spreadsheet would read as a formula is neutralised', async () => {
      const made = await contractWith(company.A, [['INVOICE_ISSUED', 5]]);
      await prisma.contractPayment.update({ where: { id: made.payments[0] }, data: { invoiceNumber: '=HYPERLINK("http://x")' } });
      const res = await exportOf('finance', `contractId=${made.id}`).expect(200);
      expect(res.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    });
  });

  it('UAT-3: the Payment Pending instalment becomes Overdue by the system, the Not Invoiced one shows "Due, not invoiced", the three groups are told and the Sales Manager\'s overview adds up', async () => {
    const made = await contractWith(company.A, [['PAYMENT_PENDING', -1, '49.40'], ['NOT_INVOICED', -1, '49.40']]);
    await as('salesA').post(`/contracts/${made.id}/payments/${made.payments[0]}/receipts`, { amount: '1.00', receivedOn: iso(todayUtc()), method: 'CASH' }).expect(403);

    await jobWith().run(new Date());

    expect((await row(made.payments[0])).status).toBe('OVERDUE');
    expect((await row(made.payments[1])).status).toBe('NOT_INVOICED');
    const recipients = (await notices(made.id)).map((n) => n.recipientUserId);
    expect(recipients).toEqual(expect.arrayContaining([users.finance, users.salesA, users.manager]));

    const overview = await as('manager').get(`/payments?contractId=${made.id}`).expect(200);
    const byId = Object.fromEntries(overview.body.data.map((r: any) => [r.id, r]));
    expect(byId[made.payments[0]]).toMatchObject({ status: 'OVERDUE', dueNotInvoiced: false });
    expect(byId[made.payments[1]]).toMatchObject({ status: 'NOT_INVOICED', dueNotInvoiced: true });
    expect(overview.body.totals).toEqual({ amount: '98.80', paidAmount: '0.00', outstanding: '98.80' });

    const overdue = await as('manager').get(`/payments?contractId=${made.id}&status=OVERDUE`).expect(200);
    expect(overdue.body.totals).toEqual({ amount: '49.40', paidAmount: '0.00', outstanding: '49.40' });
  });
});
