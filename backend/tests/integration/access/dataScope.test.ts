import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 4 end to end (UAT-1): OWN, TEAM and ALL decide which companies each
 * role reaches, in lists and counts as well as single records, and a record
 * outside the scope is "not found" (FR-RBAC-05, 11, 12, 13).
 */
describe('Data scope (FR-RBAC-11..13, UAT-1)', () => {
  const tenantId = `t-scope-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-scope-${label}-${randomUUID()}`;
  const users = {
    salesA: uid('sales-a'),
    salesB: uid('sales-b'),
    manager: uid('manager'),
    reception: uid('reception'),
    admin: uid('admin'),
  };
  const clients = {
    ofA: `c-scope-a-${randomUUID()}`,
    ofB: `c-scope-b-${randomUUID()}`,
    unassigned: `c-scope-none-${randomUUID()}`,
    ofReception: `c-scope-rec-${randomUUID()}`,
  };
  const appointments = {
    ofA: `a-scope-a-${randomUUID()}`,
    ofB: `a-scope-b-${randomUUID()}`,
  };
  const contractOfB = `k-scope-b-${randomUUID()}`;
  const quotations = {
    ofA: `q-scope-a-${randomUUID()}`,
    ofB: `q-scope-b-${randomUUID()}`,
  };
  const invoiceOfB = `inv-scope-b-${randomUUID()}`;
  const tokens = {} as Record<keyof typeof users, string>;
  let app: express.Express;

  const get = (who: keyof typeof users, path: string) =>
    request(app).get(`/api/${slug}${path}`).set('Authorization', `Bearer ${tokens[who]}`);

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Scope Tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const roleOf: Record<keyof typeof users, RoleKey> = {
      salesA: RoleKey.SalesUser,
      salesB: RoleKey.SalesUser,
      manager: RoleKey.SalesManager,
      reception: RoleKey.Reception,
      admin: RoleKey.Administrator,
    };

    for (const [who, id] of Object.entries(users) as Array<[keyof typeof users, string]>) {
      await prisma.user.create({
        data: { id, email: `${id}@example.com`, hashedPassword: 'pwd', role: 'STAFF', roleId: roles[roleOf[who]], tenantId },
      });
      tokens[who] = tokenService.sign({ userId: id, role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    const client = (id: string, name: string, assignedUserId: string | null) => ({
      id, tenantId, name, phone: '+355 69 000 0000', assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
    });
    await prisma.client.createMany({
      data: [
        client(clients.ofA, 'Scope A Co', users.salesA),
        client(clients.ofB, 'Scope B Co', users.salesB),
        client(clients.unassigned, 'Scope Unassigned Co', null),
        // Assigned to someone outside the sales team: not the Manager's.
        client(clients.ofReception, 'Scope Reception Co', users.reception),
      ],
    });

    await prisma.contract.create({
      data: {
        id: contractOfB, tenantId, clientId: clients.ofB, planName: 'Gold', amount: 250, billingPeriod: 'MONTHLY',
        status: 'ACTIVE', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-12-31'),
        assignedUserId: users.salesB, createdByUserId: users.salesB, notes: 'Discount 10%',
        payments: {
          create: [{ id: `p-${contractOfB}`, tenantId, periodIndex: 1, dueDate: new Date('2026-01-01'), amount: 250, status: 'PAID', paidAmount: 250 }],
        },
      },
    });
    await prisma.interaction.createMany({
      data: [
        { id: `i-note-${contractOfB}`, tenantId, clientId: clients.ofB, authorUserId: users.salesB, content: 'Prefers mornings', channel: 'NOTE' },
        { id: `i-call-${contractOfB}`, tenantId, clientId: clients.ofB, authorUserId: users.salesB, content: 'Discussed renewal price', channel: 'CALL' },
      ],
    });

    // Reports are Administrator-only by default (D8). Granting them to the
    // sales roles here is the Slice 6 customisation the scope must survive.
    await prisma.rolePermission.createMany({
      data: [RoleKey.SalesUser, RoleKey.SalesManager].map((key) => ({ roleId: roles[key], permissionKey: 'reports.view', scope: null })),
    });

    const warehouseId = `w-scope-${randomUUID()}`;
    const productId = `pr-scope-${randomUUID()}`;
    await prisma.warehouse.create({ data: { id: warehouseId, tenantId, name: 'Scope WH' } });
    await prisma.product.create({ data: { id: productId, tenantId, name: 'Scope Plan', description: '', price: 100 } });
    const quotation = (id: string, clientId: string, createdByUserId: string, unitPrice: number) =>
      prisma.quotation.create({
        data: {
          id, tenantId, clientId, createdByUserId, status: 'ACCEPTED',
          lineItems: { create: [{ tenantId, productId, warehouseId, quantity: 1, unitPrice }] },
        },
      });
    await quotation(quotations.ofA, clients.ofA, users.salesA, 100);
    await quotation(quotations.ofB, clients.ofB, users.salesB, 300);
    await prisma.invoice.create({
      data: {
        id: invoiceOfB, tenantId, clientId: clients.ofB, quotationId: quotations.ofB, createdByUserId: users.salesB,
        status: 'SENT', dueDate: new Date('2026-12-31'),
        lineItems: { create: [{ tenantId, productId, warehouseId, quantity: 1, unitPrice: 300 }] },
      },
    });

    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    await prisma.appointment.createMany({
      data: [
        { id: appointments.ofA, tenantId, clientId: clients.ofA, assignedUserId: users.salesA, scheduledAt: tomorrow, status: 'SCHEDULED' },
        { id: appointments.ofB, tenantId, clientId: clients.ofB, assignedUserId: users.salesB, scheduledAt: tomorrow, status: 'SCHEDULED' },
      ],
    });
  });

  afterAll(async () => {
    // Everything the requests may have created for this tenant — the default
    // client fields among them — or the tenant row survives and trips the
    // unscoped wipes of other suites in this worker (TD-001).
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await prisma.invoice.deleteMany({ where: { tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.warehouse.deleteMany({ where: { tenantId } });
    await prisma.contractPayment.deleteMany({ where: { tenantId } });
    await prisma.contractStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.interaction.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.customFieldDefinition.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const ids = (res: request.Response) => res.body.items.map((c: { id: string }) => c.id).sort();

  describe('companies', () => {
    it('FR-RBAC-13 a Sales User\'s list and count hold only their own companies', async () => {
      const res = await get('salesA', '/clients/search');

      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([clients.ofA]);
      expect(res.body.total).toBe(1);
    });

    it('FR-RBAC-11 a Sales User gets 404 for another salesperson\'s company, and 200 for their own', async () => {
      expect((await get('salesA', `/clients/${clients.ofB}`)).status).toBe(404);
      expect((await get('salesA', `/clients/${clients.ofB}/history`)).status).toBe(404);
      expect((await get('salesA', `/clients/${clients.ofB}/related-counts`)).status).toBe(404);
      expect((await get('salesA', `/clients/${clients.ofA}`)).status).toBe(200);
    });

    it('FR-RBAC-12 the Sales Manager sees every salesperson\'s companies and the unassigned ones', async () => {
      const res = await get('manager', '/clients/search');

      expect(ids(res)).toEqual([clients.ofA, clients.ofB, clients.unassigned].sort());
      expect(res.body.total).toBe(3);
      expect((await get('manager', `/clients/${clients.ofReception}`)).status).toBe(404);
    });

    it('Reception and the Administrator see every company', async () => {
      expect((await get('reception', '/clients/search')).body.total).toBe(4);
      expect((await get('admin', '/clients/search')).body.total).toBe(4);
    });

    it('UAT-1 Reception finds a company by phone and opens it', async () => {
      const found = await get('reception', `/clients/search?search=${encodeURIComponent('69 000')}`);
      expect(found.body.total).toBe(4);
      expect((await get('reception', `/clients/${clients.ofB}`)).status).toBe(200);
    });

    it('the list\'s "mine" filter narrows a wider scope, and never widens a narrow one', async () => {
      expect(ids(await get('admin', '/clients/search?reach=OWN'))).toEqual([]);
      expect(ids(await get('admin', '/clients/search?reach=TEAM'))).toEqual(
        [clients.ofA, clients.ofB, clients.unassigned].sort()
      );
      expect(ids(await get('salesA', '/clients/search?reach=ALL'))).toEqual([clients.ofA]);
    });

    it('FR-RBAC-11 a Sales User cannot edit or add activity to another salesperson\'s company', async () => {
      const edit = await request(app)
        .put(`/api/${slug}/clients/${clients.ofB}`)
        .set('Authorization', `Bearer ${tokens.salesA}`)
        .send({ notes: 'mine now' });
      expect(edit.status).toBe(404);

      const note = await request(app)
        .post(`/api/${slug}/clients/${clients.ofB}/interactions`)
        .set('Authorization', `Bearer ${tokens.salesA}`)
        .send({ content: 'hello', channel: 'CALL' });
      expect(note.status).toBe(404);
    });
  });

  describe('appointments', () => {
    const range = () => {
      const from = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const to = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
      return `startDate=${encodeURIComponent(from)}&endDate=${encodeURIComponent(to)}`;
    };
    const apptIds = (res: request.Response) => res.body.map((a: { id: string }) => a.id).sort();

    it('FR-RBAC-13 a Sales User\'s calendar holds only their own appointments', async () => {
      const res = await get('salesA', `/appointments/search?${range()}`);
      expect(res.status).toBe(200);
      expect(apptIds(res)).toEqual([appointments.ofA]);
    });

    it('FR-RBAC-12 the Sales Manager\'s calendar holds the whole team\'s', async () => {
      const res = await get('manager', `/appointments/search?${range()}`);
      expect(apptIds(res)).toEqual([appointments.ofA, appointments.ofB].sort());
    });

    it('FR-RBAC-11 another salesperson\'s appointment is not found', async () => {
      expect((await get('salesA', `/appointments/${appointments.ofB}/history`)).status).toBe(404);
      expect((await get('salesA', `/appointments/${appointments.ofA}/history`)).status).toBe(200);
    });
  });

  describe('quotations and invoices (FR-RBAC-11: they follow their company)', () => {
    it('a Sales User gets 404 for another salesperson\'s quotation and invoice, and 200 for their own', async () => {
      expect((await get('salesA', `/quotations/${quotations.ofB}`)).status).toBe(404);
      expect((await get('salesA', `/invoices/${invoiceOfB}`)).status).toBe(404);
      expect((await get('salesA', `/quotations/${quotations.ofA}`)).status).toBe(200);
      expect((await get('salesB', `/invoices/${invoiceOfB}`)).status).toBe(200);
    });

    it('FR-RBAC-13 the quotation and invoice lists hold only what the scope reaches', async () => {
      const count = async (who: keyof typeof users, path: string) => (await get(who, path)).body.total;

      expect(await count('salesA', '/quotations')).toBe(1);
      expect(await count('manager', '/quotations')).toBe(2);
      expect(await count('salesA', '/invoices')).toBe(0);
      expect(await count('manager', '/invoices')).toBe(1);
    });
  });

  describe('reports', () => {
    const revenue = async (who: keyof typeof users) =>
      (await get(who, '/reports/revenue')).body.revenue.reduce((sum: number, m: { revenue: number }) => sum + m.revenue, 0);
    const companies = async (who: keyof typeof users) =>
      (await get(who, '/reports/clients')).body.clients.reduce((sum: number, c: { count: number }) => sum + c.count, 0);

    it('FR-RBAC-13 revenue follows the viewer\'s scope', async () => {
      expect(await revenue('salesA')).toBe(100);
      expect(await revenue('manager')).toBe(400);
      expect(await revenue('admin')).toBe(400);
    });

    it('FR-RBAC-13 the company status mix follows the viewer\'s scope', async () => {
      expect(await companies('salesA')).toBe(1);
      expect(await companies('manager')).toBe(3);
      expect(await companies('admin')).toBe(4);
    });
  });

  describe('dashboard', () => {
    it('FR-RBAC-13 the company count follows the viewer\'s scope', async () => {
      const total = async (who: keyof typeof users) => (await get(who, '/dashboard/metrics')).body.totalClients;

      expect(await total('salesA')).toBe(1);
      expect(await total('manager')).toBe(3);
      expect(await total('admin')).toBe(4);
    });

    it('FR-RBAC-13 the appointment count follows the viewer\'s calendar scope', async () => {
      const upcoming = async (who: keyof typeof users) => (await get(who, '/appointments/upcoming')).body.length;

      expect(await upcoming('salesA')).toBe(1);
      expect(await upcoming('manager')).toBe(2);
    });
  });

  describe('field redaction for Reception (FR-RBAC-06, UAT-1)', () => {
    /** Every key anywhere in a JSON body. */
    const keysOf = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(keysOf);
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
      }
      return [];
    };
    const moneyKeys = (body: unknown) => keysOf(body).filter((key) => /amount|price|payment/i.test(key));

    it('the company, its contracts and its timeline carry no amount, price or payment field', async () => {
      const responses = await Promise.all([
        get('reception', `/clients/${clients.ofB}`),
        get('reception', '/contracts'),
        get('reception', `/contracts/${contractOfB}`),
        get('reception', `/contracts/client/${clients.ofB}`),
        get('reception', `/clients/${clients.ofB}/history`),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(moneyKeys(res.body)).toEqual([]);
      }
    });

    it('Reception still sees contract validity', async () => {
      const res = await get('reception', `/contracts/${contractOfB}`);
      expect(res.body.contract).toMatchObject({ status: 'ACTIVE', planName: 'Gold' });
      expect(res.body.contract.endsAt).toBeDefined();
    });

    it('D3 Reception\'s timeline shows the note and not the call', async () => {
      const res = await get('reception', `/clients/${clients.ofB}/history`);
      const contents = res.body.timeline.map((entry: any) => entry.content ?? entry.description ?? entry.title);
      expect(JSON.stringify(res.body)).toContain('Prefers mornings');
      expect(JSON.stringify(res.body)).not.toContain('Discussed renewal price');
      expect(contents.length).toBe(1);
    });

    it('the Administrator gets the same contract with its money', async () => {
      const res = await get('admin', `/contracts/${contractOfB}`);
      expect(res.body.contract.amount).toBe(250);
      expect(res.body.payments).toHaveLength(1);
    });
  });
});
