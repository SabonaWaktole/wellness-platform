import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);
const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset));
const iso = (date: Date) => date.toISOString().slice(0, 10);

/**
 * M3 Slice 8: instalments, invoices, receipts and history (FR-PAY-03..08, 10, 12,
 * FR-RBAC-24, FR-AUD-11), and the UAT-2 scenario. Contracts and their instalments
 * are written straight to the database: how they got there is Slices 4 and 5.
 */
describe('Instalments: invoices, receipts, history (M3 Slice 8)', () => {
  const tenantId = `t-instalments-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-pay-${label}-${randomUUID()}`;
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
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string, body: object = {}) => auth(request(app).delete(`/api/${slug}${path}`)).send(body),
    };
  };
  const company = { A: randomUUID(), B: randomUUID() };

  /** An Active contract with `count` monthly instalments of `amount`, due from last month. */
  const contractWith = async (clientId: string, count: number, amount = '49.40') => {
    const id = randomUUID();
    await prisma.contract.create({
      data: {
        id, tenantId, clientId, planName: 'Gold', status: 'ACTIVE', amount, billingPeriod: 'MONTHLY',
        startsAt: day(-30), endsAt: day(335), createdByUserId: users.admin, assignedUserId: users.salesA,
        number: `CTR-${randomUUID().slice(0, 6)}`,
      } as any,
    });
    const payments: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const paymentId = randomUUID();
      payments.push(paymentId);
      await prisma.contractPayment.create({
        data: { id: paymentId, tenantId, contractId: id, periodIndex: i + 1, dueDate: day(-30 + 30 * i), amount, status: 'NOT_INVOICED' },
      });
    }
    return { id, payments };
  };
  const pay = (contractId: string, paymentId: string, suffix = '') => `/contracts/${contractId}/payments/${paymentId}${suffix}`;
  const invoice = (who: Who, contractId: string, paymentId: string, number = 'INV-1') =>
    as(who).post(pay(contractId, paymentId, '/invoice'), { invoiceNumber: number, invoiceDate: today() });
  const receipt = (who: Who, contractId: string, paymentId: string, amount: string) =>
    as(who).post(pay(contractId, paymentId, '/receipts'), { amount, receivedOn: today(), method: 'BANK_TRANSFER' });
  const auditCount = (paymentId: string) => prisma.auditEntry.count({ where: { tenantId, entityType: 'ContractPayment', entityId: paymentId } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Instalments tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);

    // A Finance role: records money for every company, without managing contracts (FR-PAY-05).
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
        permissions: {
          create: [
            { permissionKey: 'payments.view', scope: 'ALL' },
            { permissionKey: 'contracts.validity.view', scope: 'ALL' },
          ],
        },
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
      ] as any,
    });
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-PAY-05, FR-RBAC-24: a Sales User, Sales Manager, CEO and Reception get 403 on every instalment write, even on their own contract', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    const writes: Array<(who: Who) => request.Test> = [
      (who) => as(who).post(`/contracts/${c.id}/payments`, { dueDate: today(), amount: '10.00', reason: 'x' }),
      (who) => as(who).patch(pay(c.id, p), { note: 'x' }),
      (who) => as(who).delete(pay(c.id, p), { reason: 'x' }),
      (who) => invoice(who, c.id, p),
      (who) => as(who).post(pay(c.id, p, '/pending')),
      (who) => receipt(who, c.id, p, '10.00'),
      (who) => as(who).post(pay(c.id, p, '/receipts/reverse'), { amount: '10.00', comment: 'x' }),
      (who) => as(who).post(pay(c.id, p, '/correct'), { status: 'NOT_INVOICED', comment: 'x' }),
    ];
    for (const who of ['salesA', 'manager', 'ceo', 'reception'] as Who[]) {
      for (const write of writes) await write(who).expect(403);
    }
    // Nothing changed.
    expect((await prisma.contractPayment.findUniqueOrThrow({ where: { id: p } })).status).toBe('NOT_INVOICED');
    expect(await auditCount(p)).toBe(0);

    // The Administrator and a Finance role holding only payments.update succeed.
    await invoice('admin', c.id, p).expect(200);
    await as('finance').post(pay(c.id, p, '/pending')).expect(200);
  });

  it('FR-PAY-03: every instalment field is recorded, can be edited by an authorised user and is visible', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    await invoice('finance', c.id, p, 'INV-77').expect(200);
    await as('finance').post(pay(c.id, p, '/pending')).expect(200);
    await receipt('finance', c.id, p, '10.00').expect(201);
    await as('finance').patch(pay(c.id, p), { dueDate: '2030-05-01', amount: '60.00', note: 'Agreed by phone', reason: 'x' }).expect(400); // money received
    await as('finance').patch(pay(c.id, p), { note: 'Agreed by phone' }).expect(200);

    const row = (await as('finance').get(`/contracts/${c.id}/payments`).expect(200)).body.payments[0];
    expect(row).toMatchObject({
      status: 'PARTIALLY_PAID',
      amount: '49.40',
      paidAmount: '10.00',
      outstanding: '39.40',
      method: 'BANK_TRANSFER',
      invoiceNumber: 'INV-77',
      note: 'Agreed by phone',
    });
    expect(row.invoiceDate).toBeTruthy();
    expect(row.paidAt).toBeTruthy();
    expect(row.dueDate).toBeTruthy();

    // With nothing received, the due date and amount change (with a reason).
    const q = await contractWith(company.A, 1);
    const changed = await as('finance').patch(pay(q.id, q.payments[0]), { dueDate: '2030-05-01', amount: '60.00', reason: 'Client asked' }).expect(200);
    expect(changed.body.payment).toMatchObject({ amount: '60.00' });
    expect(iso(new Date(changed.body.payment.dueDate))).toBe('2030-05-01');
  });

  it('FR-PAY-04: add needs a reason; removing an instalment with money received is refused; changing the amount of a Paid one is refused; the price does not reach issued instalments', async () => {
    const c = await contractWith(company.A, 2);
    await as('admin').post(`/contracts/${c.id}/payments`, { dueDate: today(), amount: '15.00' }).expect(400);
    const added = await as('admin').post(`/contracts/${c.id}/payments`, { dueDate: today(), amount: '15.00', reason: 'Set-up fee' }).expect(201);
    expect(added.body.payment).toMatchObject({ amount: '15.00', status: 'NOT_INVOICED', periodIndex: 3 });

    const [first, second] = c.payments;
    await invoice('admin', c.id, first).expect(200);
    await receipt('admin', c.id, first, '20.00').expect(201);
    await as('admin').delete(pay(c.id, first), { reason: 'Entered twice' }).expect(400);
    expect(await prisma.contractPayment.count({ where: { id: first } })).toBe(1);
    await as('admin').delete(pay(c.id, second)).expect(400); // a reason is needed
    await as('admin').delete(pay(c.id, second), { reason: 'Entered twice' }).expect(200);
    expect(await prisma.contractPayment.count({ where: { id: second } })).toBe(0);

    await receipt('admin', c.id, first, '29.40').expect(201);
    const refused = await as('admin').patch(pay(c.id, first), { amount: '10.00', reason: 'Oops' }).expect(400);
    expect(refused.body.error).toMatch(/received/i);

    await prisma.contract.update({ where: { id: c.id }, data: { amount: '99.00' } });
    const rows = (await as('admin').get(`/contracts/${c.id}/payments`).expect(200)).body.payments as Array<{ amount: string }>;
    expect(rows.map((r) => r.amount).sort()).toEqual(['15.00', '49.40']);
  });

  it('FR-PAY-06: Invoice Issued needs a number and a date; Paid is never offered; a full receipt sets Paid; a correction needs a comment', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    await as('admin').post(pay(c.id, p, '/invoice'), { invoiceNumber: '  ', invoiceDate: today() }).expect(400);
    await as('admin').post(pay(c.id, p, '/invoice'), { invoiceNumber: 'INV-9' }).expect(400);
    await as('admin').post(pay(c.id, p, '/pending')).expect(400); // no invoice yet
    await invoice('admin', c.id, p, 'INV-9').expect(200);
    await as('admin').post(pay(c.id, p, '/pending')).expect(200);

    for (const status of ['PAID', 'PARTIALLY_PAID', 'OVERDUE']) {
      await as('admin').post(pay(c.id, p, '/correct'), { status, comment: 'try' }).expect(400);
    }
    await as('admin').post(pay(c.id, p, '/correct'), { status: 'NOT_INVOICED', comment: '' }).expect(400);
    const back = await as('admin').post(pay(c.id, p, '/correct'), { status: 'INVOICE_ISSUED', comment: 'Not sent yet' }).expect(200);
    expect(back.body.payment.status).toBe('INVOICE_ISSUED');

    await as('admin').post(pay(c.id, p, '/pending')).expect(200);
    const paid = await receipt('admin', c.id, p, '49.40').expect(201);
    expect(paid.body.payment.status).toBe('PAID');
    await as('admin').post(pay(c.id, p, '/correct'), { status: 'NOT_INVOICED', comment: 'Wrong month' }).expect(400); // money received: reverse instead
  });

  it('FR-PAY-07: €20.00 gives Partially Paid with €29.40 outstanding, €29.40 gives Paid, a further €1.00 is refused', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    await invoice('admin', c.id, p).expect(200);
    await as('admin').post(pay(c.id, p, '/pending')).expect(200);

    const first = await receipt('admin', c.id, p, '20.00').expect(201);
    expect(first.body.payment).toMatchObject({ status: 'PARTIALLY_PAID', paidAmount: '20.00', outstanding: '29.40' });
    const second = await receipt('admin', c.id, p, '29.40').expect(201);
    expect(second.body.payment).toMatchObject({ status: 'PAID', paidAmount: '49.40', outstanding: '0.00' });
    const extra = await receipt('admin', c.id, p, '1.00');
    expect(extra.status).toBe(400);
    expect(extra.body.error).toMatch(/outstanding/i);

    // The date, method and amount are checked.
    const q = await contractWith(company.A, 1);
    await as('admin').post(pay(q.id, q.payments[0], '/receipts'), { amount: '5.00', receivedOn: iso(day(2)), method: 'CASH' }).expect(400);
    await as('admin').post(pay(q.id, q.payments[0], '/receipts'), { amount: '5.00', receivedOn: today(), method: 'bitcoin' }).expect(400);
    await as('admin').post(pay(q.id, q.payments[0], '/receipts'), { amount: '5.001', receivedOn: today(), method: 'CASH' }).expect(400);
    await as('admin').post(pay(q.id, q.payments[0], '/receipts'), { amount: '0.00', receivedOn: today(), method: 'CASH' }).expect(400);
  });

  it('FR-PAY-07, D6: reversing a receipt takes the money back and works the status out again', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    await invoice('admin', c.id, p).expect(200);
    await receipt('admin', c.id, p, '49.40').expect(201);

    await as('admin').post(pay(c.id, p, '/receipts/reverse'), { amount: '19.40' }).expect(400); // a comment is needed
    await as('admin').post(pay(c.id, p, '/receipts/reverse'), { amount: '60.00', comment: 'Too much' }).expect(400);
    const partly = await as('admin').post(pay(c.id, p, '/receipts/reverse'), { amount: '19.40', comment: 'Partly bounced' }).expect(200);
    expect(partly.body.payment).toMatchObject({ status: 'PARTIALLY_PAID', paidAmount: '30.00' });
    const all = await as('admin').post(pay(c.id, p, '/receipts/reverse'), { amount: '30.00', comment: 'Bounced' }).expect(200);
    expect(all.body.payment).toMatchObject({ status: 'PAYMENT_PENDING', paidAmount: '0.00', paidAt: null });
  });

  it('FR-PAY-08: the history lists Invoice Issued, the €20.00 receipt and the €29.40 receipt, with user and date', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    await invoice('admin', c.id, p, 'INV-5').expect(200);
    await receipt('finance', c.id, p, '20.00').expect(201);
    await receipt('finance', c.id, p, '29.40').expect(201);

    const history = (await as('admin').get(pay(c.id, p, '/history')).expect(200)).body.history as Array<Record<string, any>>;
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.amountReceived, h.changedByUserId])).toEqual([
      ['NOT_INVOICED', 'INVOICE_ISSUED', '0.00', users.admin],
      ['INVOICE_ISSUED', 'PARTIALLY_PAID', '20.00', users.finance],
      ['PARTIALLY_PAID', 'PAID', '29.40', users.finance],
    ]);
    for (const entry of history) expect(new Date(entry.changedAt).getTime()).not.toBeNaN();
    expect(history[1]).toMatchObject({ method: 'BANK_TRANSFER' });
    expect(iso(new Date(history[1].receivedOn))).toBe(today());
  });

  it('FR-PAY-10: 12 instalments of €49.40 with 3 paid give total €592.80, received €148.20, outstanding €444.60', async () => {
    const c = await contractWith(company.A, 12);
    for (const p of c.payments.slice(0, 3)) {
      await invoice('admin', c.id, p, `INV-${p.slice(0, 4)}`).expect(200);
      await receipt('admin', c.id, p, '49.40').expect(201);
    }
    const { summary } = (await as('admin').get(`/contracts/${c.id}/payments`).expect(200)).body;
    expect(summary).toMatchObject({ total: '592.80', received: '148.20', outstanding: '444.60', overdueCount: 0, overdueAmount: '0.00' });
    expect(summary.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const detail = (await as('admin').get(`/contracts/${c.id}`).expect(200)).body;
    expect(detail.paymentSummary).toMatchObject({ total: '592.80', received: '148.20', outstanding: '444.60' });
  });

  it('FR-PAY-09: an instalment past its due date that is Not Invoiced carries the "due, not invoiced" flag', async () => {
    const c = await contractWith(company.A, 2);
    const rows = (await as('admin').get(`/contracts/${c.id}/payments`).expect(200)).body.payments as Array<{ status: string; dueNotInvoiced: boolean }>;
    expect(rows.map((r) => [r.status, r.dueNotInvoiced])).toEqual([['NOT_INVOICED', true], ['NOT_INVOICED', false]]);
  });

  it('FR-PAY-12: Reception sees no payment data; a role without commercial.view sees no amounts; a Sales User sees only own companies\' payments', async () => {
    const own = await contractWith(company.A, 2);
    const foreign = await contractWith(company.B, 1);
    await invoice('admin', own.id, own.payments[0]).expect(200);
    await receipt('admin', own.id, own.payments[0], '20.00').expect(201);

    // Reception: no payment route, no payment field anywhere.
    await as('reception').get(`/contracts/${own.id}/payments`).expect(403);
    await as('reception').get(pay(own.id, own.payments[0], '/history')).expect(403);
    const receptionDetail = await as('reception').get(`/contracts/${own.id}`).expect(200);
    const receptionCompany = await as('reception').get(`/clients/${company.A}`).expect(200);
    for (const body of [receptionDetail.body, receptionCompany.body]) {
      expect(JSON.stringify(body)).not.toMatch(/payment|paid|outstanding|invoice|amount|method/i);
    }

    // Payments view without commercial view: the instalments, but no figure.
    const blind = await as('figures').get(`/contracts/${own.id}/payments`).expect(200);
    expect(blind.body.payments).toHaveLength(2);
    expect(JSON.stringify(blind.body)).not.toMatch(/"(amount|paidAmount|outstanding|total|received|overdueAmount)"/);
    expect(blind.body.payments[0]).toMatchObject({ status: 'PARTIALLY_PAID', invoiceNumber: 'INV-1' });
    const blindHistory = await as('figures').get(pay(own.id, own.payments[0], '/history')).expect(200);
    expect(JSON.stringify(blindHistory.body)).not.toMatch(/amountReceived/);
    const blindDetail = (await as('figures').get(`/contracts/${own.id}`).expect(200)).body;
    expect(JSON.stringify(blindDetail.payments)).not.toMatch(/"(amount|paidAmount|outstanding)"/);

    // A Sales User reads own companies' instalments and gets 404 on a colleague's.
    const mine = await as('salesA').get(`/contracts/${own.id}/payments`).expect(200);
    expect(mine.body.payments).toHaveLength(2);
    await as('salesA').get(`/contracts/${foreign.id}/payments`).expect(404);
    await as('salesA').get(pay(foreign.id, foreign.payments[0], '/history')).expect(404);
    // Read only: the same Sales User is refused every write, but the CEO reads everything.
    await as('ceo').get(`/contracts/${foreign.id}/payments`).expect(200);
  });

  it('FR-AUD-11: each action creates one audit entry, and the history row is written with it', async () => {
    const c = await contractWith(company.A, 1);
    const p = c.payments[0];
    const steps: Array<() => request.Test> = [
      () => invoice('admin', c.id, p),
      () => as('admin').post(pay(c.id, p, '/pending')),
      () => receipt('admin', c.id, p, '20.00'),
      () => as('admin').post(pay(c.id, p, '/receipts/reverse'), { amount: '20.00', comment: 'Bounced' }),
      () => as('admin').post(pay(c.id, p, '/correct'), { status: 'INVOICE_ISSUED', comment: 'Resend' }),
      () => as('admin').patch(pay(c.id, p), { dueDate: iso(day(10)), reason: 'Client asked' }),
    ];
    let count = 0;
    for (const step of steps) {
      await step();
      count += 1;
      expect(await auditCount(p)).toBe(count);
      expect(await prisma.contractPaymentHistory.count({ where: { paymentId: p } })).toBe(count);
    }
    const reason = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityId: p }, orderBy: { at: 'desc' } });
    expect(JSON.stringify(reason.changes)).toContain('Client asked');

    await as('admin').delete(pay(c.id, p), { reason: 'Entered twice' }).expect(200);
    expect(await auditCount(p)).toBe(count + 1);
    expect((await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityId: p }, orderBy: { at: 'desc' } })).action).toBe('DELETE');
  });

  it('UAT-2: the Sales User cannot change an instalment; the authorised user records INV-1, Payment Pending, €20.00 then €29.40; the extra €1.00 is refused; history and audit show each step', async () => {
    const c = await contractWith(company.A, 12);
    const p = c.payments[0];

    await invoice('salesA', c.id, p, 'INV-1').expect(403);

    await invoice('finance', c.id, p, 'INV-1').expect(200);
    await as('finance').post(pay(c.id, p, '/pending')).expect(200);
    await receipt('finance', c.id, p, '20.00').expect(201);
    await receipt('finance', c.id, p, '29.40').expect(201);
    await receipt('finance', c.id, p, '1.00').expect(400);

    const history = (await as('finance').get(pay(c.id, p, '/history')).expect(200)).body.history as Array<{ toStatus: string; amountReceived: string }>;
    expect(history.map((h) => h.toStatus)).toEqual(['INVOICE_ISSUED', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'PAID']);
    expect(history.map((h) => h.amountReceived)).toEqual(['0.00', '0.00', '20.00', '29.40']);
    expect(await auditCount(p)).toBe(4);
    const row = (await as('finance').get(`/contracts/${c.id}/payments`).expect(200)).body.payments[0];
    expect(row).toMatchObject({ status: 'PAID', paidAmount: '49.40', invoiceNumber: 'INV-1' });
  });
});
