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

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * M3 Slice 4 end to end: a contract made from a won deal (FR-CON-01..10),
 * the one-contract-per-deal rule the database enforces (NFR-DAT-01), the
 * scope rules (FR-RBAC-22) and what Reception receives (FR-RBAC-21).
 */

describe('Contract lifecycle and signed document (M3 Slice 5)', () => {
  const tenantId = `t-contract-life-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-cl-${label}-${randomUUID()}`;
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
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
      upload: (path: string, file: Buffer, filename = 'signed.pdf', contentType = 'application/pdf') =>
        auth(request(app).post(`/api/${slug}${path}`)).attach('file', file, { filename, contentType }),
    };
  };
  const company = { A: randomUUID(), B: randomUUID() };
  let tiranaId: string;
  let areaId: string | null;
  const pdf = (marker = 'one') => Buffer.from(`%PDF-1.4\n% ${marker}\n%%EOF`);

  const wonDeal = async (clientId: string, who: Who = 'salesA'): Promise<string> => {
    const dealId = (await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' }).expect(201)).body.data.id as string;
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
    await as(who).post(`/offers/${offerId}/mark-sent`, { sentDate: today() }).expect(200);
    await as(who).post(`/deals/${dealId}/win`, { offerId, closeFollowUps: false }).expect(200);
    return dealId;
  };
  /** A Draft contract made from a fresh won deal (monthly, 12 months from today). */
  const draft = async (clientId = company.A, who: Who = 'salesA', body: object = {}) => {
    const dealId = await wonDeal(clientId, who);
    return { dealId, contract: (await as(who).post('/contracts', { dealId, ...body }).expect(201)).body };
  };
  const move = (who: Who, id: string, status: string, reason?: string) => as(who).post(`/contracts/${id}/status`, { status, reason });
  /** A contract with its signed document attached and activated. */
  const activeContract = async (clientId = company.A, who: Who = 'salesA', body: object = {}) => {
    const made = await draft(clientId, who, body);
    await as(who).upload(`/contracts/${made.contract.id}/document`, pdf()).expect(200);
    await move(who, made.contract.id, 'ACTIVE').expect(200);
    return made;
  };
  const auditCount = (entityType: string, entityId: string) => prisma.auditEntry.count({ where: { tenantId, entityType, entityId } });
  const statuses = ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'];
  const allowed = new Set([
    'DRAFT>PENDING_SIGNATURE', 'DRAFT>ACTIVE', 'PENDING_SIGNATURE>ACTIVE', 'ACTIVE>SUSPENDED', 'SUSPENDED>ACTIVE', 'ACTIVE>EXPIRED',
    'DRAFT>CANCELLED', 'PENDING_SIGNATURE>CANCELLED', 'ACTIVE>CANCELLED', 'SUSPENDED>CANCELLED',
  ]);

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Contract lifecycle', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' } });
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
    tiranaId = tirana.id;
    areaId = (tirana as { areaId?: string | null }).areaId ?? null;
    const row = (id: string, name: string, assignedUserId: string) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
      employeeCount: 2, businessTypeId: restaurant, cityId: tiranaId, areaId, status: 'PROSPECT',
    });
    await prisma.client.createMany({
      data: [row(company.A, 'Restorant A', users.salesA), row(company.B, 'Restorant B', users.salesB)],
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-CON-11, NFR-SEC-06 every move outside the table is refused with a validation error; CEO and Reception get 403 on each; a Sales User cannot suspend', async () => {
    const { contract } = await draft();
    for (const from of statuses) {
      await prisma.contract.update({ where: { id: contract.id }, data: { status: from } });
      for (const to of statuses) {
        if (allowed.has(`${from}>${to}`)) continue;
        const res = await move('admin', contract.id, to, 'Because');
        expect([from, to, res.status]).toEqual([from, to, 400]);
        expect(res.body.field).toBe('status');
        expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ status: from });
      }
    }
    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'ACTIVE' } });
    for (const who of ['ceo', 'reception'] as const) {
      for (const to of statuses) expect([who, to, (await move(who, contract.id, to, 'Because')).status]).toEqual([who, to, 403]);
      expect((await as(who).post(`/contracts/${contract.id}/activate`)).status).toBe(403);
      expect((await as(who).post(`/contracts/${contract.id}/cancel`, { reason: 'x' })).status).toBe(403);
    }
    // A Sales User holds contracts.manage but not contracts.terminate.
    expect((await move('salesA', contract.id, 'SUSPENDED', 'Unpaid')).status).toBe(403);
    expect((await move('salesA', contract.id, 'CANCELLED', 'Gone')).status).toBe(403);
    expect((await move('manager', contract.id, 'EXPIRED')).status).toBe(400);
  });

  it('FR-CON-12 a Draft without a price cannot be marked Pending Signature; afterwards the values are locked', async () => {
    const { contract } = await draft();
    await prisma.contract.update({ where: { id: contract.id }, data: { amount: '0.00' } });
    const refused = await move('salesA', contract.id, 'PENDING_SIGNATURE').expect(400);
    expect(refused.body.field).toBe('amount');
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ status: 'DRAFT', lockedAt: null });

    await prisma.contract.update({ where: { id: contract.id }, data: { amount: '49.40' } });
    await move('salesA', contract.id, 'PENDING_SIGNATURE').expect(200);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).lockedAt).not.toBeNull();

    await as('salesA').post(`/contracts/${contract.id}/refresh-from-deal`).expect(400);
    const edit = await as('salesA').patch(`/contracts/${contract.id}`, { endsAt: '2099-01-31' }).expect(400);
    expect(edit.body.field).toBe('endsAt');
    await as('salesA').patch(`/contracts/${contract.id}`, { notes: 'Waiting for the owner to sign' }).expect(200);
  });

  it('FR-CON-13, FR-PAY-02 activating needs the signed document; with it a monthly 12-month contract has 12 Not Invoiced instalments and the company becomes Client', async () => {
    const { contract } = await draft();
    await prisma.client.update({ where: { id: company.A }, data: { status: 'PROSPECT', customFieldValues: {} } });

    const refused = await move('salesA', contract.id, 'ACTIVE').expect(400);
    expect(refused.body.field).toBe('document');
    expect(await prisma.contractPayment.count({ where: { contractId: contract.id } })).toBe(0);

    await as('salesA').upload(`/contracts/${contract.id}/document`, pdf()).expect(200);
    const activated = await move('salesA', contract.id, 'ACTIVE').expect(200);
    expect(activated.body.contract.status).toBe('ACTIVE');
    expect(activated.body.generatedPayments).toBe(12);

    const rows = await prisma.contractPayment.findMany({ where: { contractId: contract.id }, orderBy: { periodIndex: 'asc' } });
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.status === 'NOT_INVOICED' && row.paidAmount.toFixed(2) === '0.00' && row.amount.toFixed(2) === '49.40')).toBe(true);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: company.A } })).status).toBe('CLIENT');

    // The instalments are not laid out a second time.
    await move('salesA', contract.id, 'ACTIVE').expect(400);
    expect(await prisma.contractPayment.count({ where: { contractId: contract.id } })).toBe(12);
  });

  it('FR-CON-14 suspending and reinstating need a reason, which is stored; a suspended contract is not valid; the salesperson is told', async () => {
    const { contract } = await activeContract();
    expect((await move('manager', contract.id, 'SUSPENDED')).status).toBe(400);
    expect((await move('manager', contract.id, 'SUSPENDED', '   ')).body.field).toBe('reason');

    await move('manager', contract.id, 'SUSPENDED', 'Unpaid invoices').expect(200);
    const suspended = await as('manager').get(`/contracts/${contract.id}`).expect(200);
    expect(suspended.body.contract).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'Unpaid invoices' });
    expect(suspended.body.history.at(-1)).toMatchObject({ fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', note: 'Unpaid invoices', changedByUserId: users.manager });
    expect(suspended.body.permittedActions).toEqual(expect.arrayContaining(['REINSTATE', 'CANCEL']));
    expect((await as('reception').get(`/contracts/${contract.id}`).expect(200)).body.contract.status).toBe('SUSPENDED');
    expect((await as('salesA').get(`/contracts/${contract.id}`).expect(200)).body.permittedActions).not.toContain('REINSTATE');

    const told = await prisma.notification.findMany({ where: { tenantId, type: 'CONTRACT_SUSPENDED', entityId: contract.id } });
    expect(told.map((n) => n.recipientUserId)).toContain(users.salesA);
    expect(told.map((n) => n.recipientUserId)).not.toContain(users.manager);

    expect((await move('manager', contract.id, 'ACTIVE')).status).toBe(400);
    expect((await move('salesA', contract.id, 'ACTIVE', 'Paid')).status).toBe(403);
    const count = await prisma.contractPayment.count({ where: { contractId: contract.id } });
    await move('manager', contract.id, 'ACTIVE', 'Paid in full').expect(200);
    expect(await prisma.contractPayment.count({ where: { contractId: contract.id } })).toBe(count);
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ status: 'ACTIVE', suspendedAt: null, suspensionReason: null });
  });

  it('FR-CON-15 cancelling in month 4 with 3 paid, 1 invoiced and 8 not invoiced leaves 4 instalments', async () => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const { contract } = await activeContract(company.A, 'salesA', { startsAt: start.toISOString().slice(0, 10) });
    const rows = await prisma.contractPayment.findMany({ where: { contractId: contract.id }, orderBy: { periodIndex: 'asc' } });
    expect(rows).toHaveLength(12);
    for (const row of rows.slice(0, 3)) await prisma.contractPayment.update({ where: { id: row.id }, data: { status: 'PAID', paidAmount: row.amount } });
    await prisma.contractPayment.update({ where: { id: rows[3].id }, data: { status: 'INVOICE_ISSUED', invoiceNumber: 'INV-1', invoiceDate: start } });

    expect((await move('manager', contract.id, 'CANCELLED')).status).toBe(400);
    expect((await move('salesA', contract.id, 'CANCELLED', 'Client left')).status).toBe(403);
    await move('manager', contract.id, 'CANCELLED', 'Client closed down').expect(200);

    const left = await prisma.contractPayment.findMany({ where: { contractId: contract.id }, orderBy: { periodIndex: 'asc' } });
    expect(left.map((row) => row.status)).toEqual(['PAID', 'PAID', 'PAID', 'INVOICE_ISSUED']);
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ status: 'CANCELLED', cancelReason: 'Client closed down' });
    const audit = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'Contract', entityId: contract.id, action: 'STATUS_CHANGE' }, orderBy: { at: 'desc' } });
    expect(audit.changes).toEqual(expect.arrayContaining([{ field: 'removedPayments', old: 8, new: 0 }, { field: 'cancelReason', old: null, new: 'Client closed down' }]));
    expect((await prisma.notification.findMany({ where: { tenantId, type: 'CONTRACT_CANCELLED', entityId: contract.id } })).map((n) => n.recipientUserId)).toContain(users.salesA);
  });

  it('FR-CON-15 a Sales User can cancel a Draft with a reason, and the Draft is kept as Cancelled', async () => {
    const { contract } = await draft();
    expect((await move('salesA', contract.id, 'CANCELLED')).status).toBe(400);
    await move('salesA', contract.id, 'CANCELLED', 'Deal fell through').expect(200);
    expect(await prisma.contract.count({ where: { id: contract.id } })).toBe(1);
    expect((await move('admin', contract.id, 'DRAFT', 'x')).status).toBe(400);
  });

  it('FR-CON-18 the history lists Draft, Pending Signature and Active with who, when and the reason; the company timeline shows each change', async () => {
    const { contract } = await draft();
    await move('salesA', contract.id, 'PENDING_SIGNATURE').expect(200);
    await as('salesA').upload(`/contracts/${contract.id}/document`, pdf()).expect(200);
    await move('salesA', contract.id, 'ACTIVE').expect(200);

    const history = (await as('salesA').get(`/contracts/${contract.id}`).expect(200)).body.history as any[];
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([['DRAFT', 'DRAFT'], ['DRAFT', 'PENDING_SIGNATURE'], ['PENDING_SIGNATURE', 'ACTIVE']]);
    expect(history.slice(1).every((h) => h.changedByUserId === users.salesA && !Number.isNaN(Date.parse(h.changedAt)))).toBe(true);

    const timeline = (await as('admin').get(`/clients/${company.A}/history?type=CONTRACT`).expect(200)).body.timeline as any[];
    const changes = timeline.filter((e) => e.type === 'CONTRACT_STATUS_CHANGED' && e.details.contractId === contract.id).map((e) => e.details.toStatus);
    expect(changes).toEqual(expect.arrayContaining(['PENDING_SIGNATURE', 'ACTIVE']));
  });

  it('FR-CON-19, NFR-SEC-06 only a real PDF under 15 MB is accepted; replacing keeps both versions; Reception gets 403; the file is not public', async () => {
    const { contract } = await draft();
    const id = contract.id;

    const exe = await as('salesA').upload(`/contracts/${id}/document`, Buffer.from('MZ\x90\x00 not a pdf'), 'contract.pdf').expect(400);
    expect(exe.body.field).toBe('file');
    await as('salesA').upload(`/contracts/${id}/document`, pdf(), 'contract.exe', 'application/x-msdownload').expect(415);
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(16 * 1024 * 1024)]);
    await as('salesA').upload(`/contracts/${id}/document`, big).expect(413);
    expect(await prisma.contractDocument.count({ where: { contractId: id } })).toBe(0);

    await as('salesA').upload(`/contracts/${id}/document`, pdf('first'), 'first.pdf').expect(200);
    await as('salesA').upload(`/contracts/${id}/document`, pdf('second'), 'second.pdf').expect(200);
    const versions = (await as('salesA').get(`/contracts/${id}/documents`).expect(200)).body.documents as any[];
    expect(versions.map((v) => [v.fileName, v.isCurrent, v.uploadedByUserId])).toEqual([['second.pdf', true, users.salesA], ['first.pdf', false, users.salesA]]);
    expect(versions.every((v) => v.url === undefined && !Number.isNaN(Date.parse(v.uploadedAt)))).toBe(true);
    expect(await prisma.contractDocument.count({ where: { contractId: id, isCurrent: true } })).toBe(1);

    const detail = (await as('salesA').get(`/contracts/${id}`).expect(200)).body;
    expect(detail.documents).toHaveLength(2);
    expect(detail.contract.documentName).toBe('second.pdf');

    const first = await as('salesA').get(`/contracts/${id}/documents/${versions[1].id}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(first.headers['content-type']).toContain('application/pdf');
    expect((first.body as Buffer).toString()).toContain('first');

    // Reception holds no commercial.view: no document of any kind, in any direction.
    await as('reception').get(`/contracts/${id}/documents`).expect(403);
    await as('reception').get(`/contracts/${id}/documents/${versions[0].id}/download`).expect(403);
    await as('reception').upload(`/contracts/${id}/document`, pdf()).expect(403);
    const receptionDetail = (await as('reception').get(`/contracts/${id}`).expect(200)).body;
    expect(receptionDetail).not.toHaveProperty('documents');
    expect(receptionDetail.contract).not.toHaveProperty('documentUrl');
    // The CEO may read it but not change it.
    await as('ceo').get(`/contracts/${id}/documents`).expect(200);
    await as('ceo').upload(`/contracts/${id}/document`, pdf()).expect(403);
    // A colleague's contract is not found, and the stored file cannot be fetched from the static folder.
    await as('salesB').get(`/contracts/${id}/documents`).expect(404);
    await as('salesB').upload(`/contracts/${id}/document`, pdf()).expect(404);
    const stored = await prisma.contractDocument.findFirstOrThrow({ where: { contractId: id, isCurrent: true } });
    expect((await request(app).get(stored.url)).status).toBe(404);

    // The delete route is gone: a signed document is never removed.
    expect([404, 405]).toContain((await as('salesA').delete(`/contracts/${id}/document`)).status);
  });

  it('FR-CON-10 after Pending Signature only the notes and the renewal date change; an end date change says to renew', async () => {
    const { contract } = await draft();
    await move('salesA', contract.id, 'PENDING_SIGNATURE').expect(200);
    const refused = await as('salesA').patch(`/contracts/${contract.id}`, { startsAt: '2030-01-01' }).expect(400);
    expect(refused.body.error).toMatch(/renew/i);
    await as('salesA').patch(`/contracts/${contract.id}`, { notes: 'Signed copy expected Friday', renewalDate: '2027-01-15' }).expect(200);
  });

  it('FR-PAY-01 winning a deal and creating a contract leave no instalment; activating lays them out, none Paid', async () => {
    const dealId = await wonDeal(company.A);
    expect(await prisma.contractPayment.count({ where: { tenantId, contract: { dealId } } })).toBe(0);
    const contract = (await as('salesA').post('/contracts', { dealId }).expect(201)).body;
    expect(await prisma.contractPayment.count({ where: { contractId: contract.id } })).toBe(0);
    // No route sets an instalment Paid from a contract status: the status endpoint has no such effect.
    await as('salesA').upload(`/contracts/${contract.id}/document`, pdf()).expect(200);
    await move('salesA', contract.id, 'ACTIVE').expect(200);
    const rows = await prisma.contractPayment.findMany({ where: { contractId: contract.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.status === 'PAID' || row.paidAmount.gt(0))).toBe(false);
  });

  it('FR-AUD-11 each action writes one audit entry, in the same transaction as the change', async () => {
    const { contract } = await draft();
    const id = contract.id;
    const step = async (run: () => Promise<unknown>) => {
      const before = await auditCount('Contract', id);
      await run();
      return (await auditCount('Contract', id)) - before;
    };
    expect(await step(() => move('salesA', id, 'PENDING_SIGNATURE').expect(200))).toBe(1);
    expect(await step(() => as('salesA').upload(`/contracts/${id}/document`, pdf()).expect(200))).toBe(1);
    expect(await step(() => move('salesA', id, 'ACTIVE').expect(200))).toBe(1);
    expect(await step(() => move('manager', id, 'SUSPENDED', 'Unpaid').expect(200))).toBe(1);
    expect(await step(() => move('manager', id, 'ACTIVE', 'Paid').expect(200))).toBe(1);
    expect(await step(() => move('manager', id, 'CANCELLED', 'Left').expect(200))).toBe(1);
    // A refused change writes nothing.
    expect(await step(() => move('manager', id, 'ACTIVE', 'Again').expect(400))).toBe(0);

    const uploaded = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'Contract', entityId: id, action: 'UPDATE' }, orderBy: { at: 'desc' } });
    expect(uploaded.changes).toEqual([{ field: 'document', old: null, new: 'signed.pdf' }]);
    const activated = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: id, action: 'STATUS_CHANGE' }, orderBy: { at: 'asc' } });
    expect((activated[1].changes as any[]).find((c) => c.field === 'generatedPayments')).toEqual({ field: 'generatedPayments', old: 0, new: 12 });
  });

  it('UAT-1 steps 1-5 and the suspend step of UAT-4: won deal, contract, pending signature, refused activation, document, Active with 12 instalments, company Client', async () => {
    await prisma.client.update({ where: { id: company.B }, data: { status: 'PROSPECT', customFieldValues: {} } });
    const { contract } = await draft(company.B, 'salesB');
    const id = contract.id;
    await move('salesB', id, 'PENDING_SIGNATURE').expect(200);
    await prisma.client.update({ where: { id: company.B }, data: { status: 'PROSPECT', customFieldValues: {} } });
    expect((await move('salesB', id, 'ACTIVE').expect(400)).body.field).toBe('document');
    await as('salesB').upload(`/contracts/${id}/document`, pdf()).expect(200);
    await move('salesB', id, 'ACTIVE').expect(200);

    const detail = (await as('salesB').get(`/contracts/${id}`).expect(200)).body;
    expect(detail.payments).toHaveLength(12);
    expect(detail.payments.every((p: any) => p.status === 'NOT_INVOICED')).toBe(true);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: company.B } })).status).toBe('CLIENT');
    const timeline = (await as('admin').get(`/clients/${company.B}/history?type=CONTRACT`).expect(200)).body.timeline as any[];
    expect(timeline.filter((e) => e.type === 'CONTRACT_STATUS_CHANGED' && e.details.contractId === id).map((e) => e.details.toStatus)).toEqual(expect.arrayContaining(['PENDING_SIGNATURE', 'ACTIVE']));

    // UAT-4: Reception sees "not valid: Suspended" once the manager suspends it.
    await move('manager', id, 'SUSPENDED', 'Payment dispute').expect(200);
    const seen = (await as('reception').get(`/contracts/${id}`).expect(200)).body.contract;
    expect(seen.status).toBe('SUSPENDED');
    expect(seen).not.toHaveProperty('suspensionReason');
  });
});
