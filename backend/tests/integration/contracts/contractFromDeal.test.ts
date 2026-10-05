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
import { PrismaContractNumbers } from '../../../src/contracts/infrastructure/PrismaContractNumbers';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * M3 Slice 4 end to end: a contract made from a won deal (FR-CON-01..10),
 * the one-contract-per-deal rule the database enforces (NFR-DAT-01), the
 * scope rules (FR-RBAC-22) and what Reception receives (FR-RBAC-21).
 */
describe('Contract from a won deal (M3 Slice 4)', () => {
  const tenantId = `t-contract-deal-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-cd-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB'), manager: uid('manager'), reception: uid('reception') };
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
      upload: (path: string, file: Buffer) => auth(request(app).post(`/api/${slug}${path}`)).attach('file', file, { filename: 'signed.pdf', contentType: 'application/pdf' }),
    };
  };
  const company = { A: randomUUID(), B: randomUUID(), admin: randomUUID() };
  let tiranaId: string;
  let areaId: string | null;

  /** A won deal on `clientId`, owned by `who` (Example A: 49.40 a month, 592.80 a year). */
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
  const contractFor = (dealId: string, who: Who = 'salesA', body: object = {}) => as(who).post('/contracts', { dealId, ...body });
  const made = async (clientId = company.A, who: Who = 'salesA', body: object = {}) => {
    const dealId = await wonDeal(clientId, who);
    const res = await contractFor(dealId, who, body).expect(201);
    return { dealId, contract: res.body };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Contract from deal', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' } });
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
      data: [row(company.A, 'Restorant A', users.salesA), row(company.B, 'Restorant B', users.salesB), row(company.admin, 'Restorant Admin', users.admin)],
    });
  }, 60_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-CON-01 creates a contract from a won deal, refuses a second, and the deal then names its contract', async () => {
    const dealId = await wonDeal(company.A);
    expect((await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data.contractId).toBeNull();

    const res = await contractFor(dealId).expect(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', dealId, legacy: false, assignedUserId: users.salesA });
    expect((await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data.contractId).toBe(res.body.id);

    const second = await contractFor(dealId).expect(409);
    expect(second.body).toMatchObject({ code: 'CONTRACT_EXISTS', contractId: res.body.id });
    expect(await prisma.contract.count({ where: { tenantId, dealId } })).toBe(1);
  });

  it('FR-CON-01 a deal that is not won has no contract, and a user without contracts.manage cannot make one', async () => {
    const open = (await as('salesA').post('/deals', { clientId: company.A, type: 'NEW_CONTRACT' }).expect(201)).body.data.id as string;
    const refused = await contractFor(open).expect(400);
    expect(refused.body.field).toBe('dealId');

    const won = await wonDeal(company.A);
    await contractFor(won, 'reception').expect(403);
  });

  it('FR-CON-02 a create without a deal is a validation error, and a legacy contract opens with the Legacy label', async () => {
    const res = await as('salesA').post('/contracts', { clientId: company.A, planName: 'Gold', amount: 100, billingPeriod: 'MONTHLY', startsAt: '2026-01-01', endsAt: '2026-12-31' }).expect(400);
    expect(res.body.field).toBe('dealId');
    await as('salesA').post('/contracts', { dealId: null }).expect(400);

    const legacyId = randomUUID();
    await prisma.contract.create({
      data: {
        id: legacyId, tenantId, clientId: company.A, assignedUserId: users.salesA, planName: 'Old plan', status: 'ACTIVE', amount: '75.50',
        billingPeriod: 'MONTHLY', startsAt: new Date('2025-01-01'), endsAt: new Date('2025-12-31'), createdByUserId: users.admin,
      },
    });
    const detail = await as('salesA').get(`/contracts/${legacyId}`).expect(200);
    expect(detail.body.contract).toMatchObject({ legacy: true, dealId: null, number: null, amount: '75.50' });
    expect(detail.body.contract.agreedAnnualValue).toBeNull();
  });

  it('FR-CON-03 fills the contract from the deal and its offer: Example A from 1 March 2027', async () => {
    const dealId = await wonDeal(company.A);
    const res = await contractFor(dealId, 'salesA', { startsAt: '2027-03-01' }).expect(201);
    const deal = await prisma.deal.findFirstOrThrow({ where: { id: dealId } });
    expect(res.body).toMatchObject({
      amount: '49.40',
      agreedAnnualValue: '592.80',
      billingPeriod: 'MONTHLY',
      startsAt: '2027-03-01T00:00:00.000Z',
      endsAt: '2028-02-29T00:00:00.000Z',
      packageId: deal.packageId,
      quotationId: deal.wonQuotationId,
      dealId,
    });
    expect(res.body.packageName).toBeTruthy();
    expect(res.body.servicesSnapshot.length).toBeGreaterThan(0);
    expect(res.body.servicesSnapshot[0]).toHaveProperty('nameSq');
    expect(res.body.termsText).toHaveProperty('sq');
    expect(res.body.quotationReference).toMatch(/^OF-\d{4}-\d{4}/);
  });

  it('FR-CON-03 the start date defaults to the deal closing date', async () => {
    const dealId = await wonDeal(company.A);
    const res = await contractFor(dealId).expect(201);
    expect(res.body.startsAt.slice(0, 10)).toBe(today());
  });

  it('FR-CON-04 the request cannot set the price, the annual value, the package or the services', async () => {
    const dealId = await wonDeal(company.A);
    for (const field of ['amount', 'agreedAnnualValue', 'packageId', 'servicesSnapshot']) {
      await contractFor(dealId, 'salesA', { [field]: field === 'servicesSnapshot' ? [] : '1.00' }).expect(400);
    }
    expect(await prisma.contract.count({ where: { tenantId, dealId } })).toBe(0);
    const edit = await contractFor(dealId).expect(201);
    await as('salesA').patch(`/contracts/${edit.body.id}`, { amount: 1 }).expect(400);
  });

  it('FR-CON-04 refresh from the deal re-reads the agreed values while Draft, and is refused from Pending Signature on', async () => {
    const { dealId, contract } = await made();
    // The Sales Manager reopened the deal and a new offer was won: the deal carries the new values.
    await prisma.deal.update({ where: { id: dealId }, data: { agreedMonthlyPrice: '60.00', agreedAnnualValue: '720.00' } });

    const refreshed = await as('salesA').post(`/contracts/${contract.id}/refresh-from-deal`).expect(200);
    expect(refreshed.body).toMatchObject({ amount: '60.00', agreedAnnualValue: '720.00' });
    const audit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: contract.id, action: 'UPDATE' } });
    expect(audit.length).toBeGreaterThan(0);

    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'PENDING_SIGNATURE' } });
    const locked = await as('salesA').post(`/contracts/${contract.id}/refresh-from-deal`).expect(400);
    expect(locked.body.error).toMatch(/locked/i);
    const detail = await as('salesA').get(`/contracts/${contract.id}`).expect(200);
    expect(detail.body.permittedActions).not.toContain('REFRESH_FROM_DEAL');
  });

  it('FR-CON-05 two simultaneous creates get different, consecutive numbers; the prefix setting is used; the year restarts the count', async () => {
    const [dealOne, dealTwo] = [await wonDeal(company.A), await wonDeal(company.A)];
    const [one, two] = await Promise.all([contractFor(dealOne), contractFor(dealTwo)]);
    expect([one.status, two.status]).toEqual([201, 201]);
    const year = new Date().getUTCFullYear();
    const sequences = [one.body.number, two.body.number].map((n: string) => Number(n.split('-')[2])).sort((a, b) => a - b);
    expect(one.body.number).toMatch(new RegExp(`^CTR-${year}-\\d{4}$`));
    expect(sequences[1]).toBe(sequences[0] + 1);

    await as('admin').patch('/settings/contracts', { numberPrefix: 'WA' }).expect(200);
    const { contract } = await made();
    expect(contract.number).toMatch(new RegExp(`^WA-${year}-\\d{4}$`));
    await as('admin').patch('/settings/contracts', { numberPrefix: 'CTR' }).expect(200);

    const numbers = new PrismaContractNumbers(prisma);
    expect(await numbers.next(tenantId, new Date('2041-06-01T12:00:00Z'))).toBe('CTR-2041-0001');
    expect(await numbers.next(tenantId, new Date('2041-07-01T12:00:00Z'))).toBe('CTR-2041-0002');
    expect(await numbers.next(tenantId, new Date('2042-01-02T12:00:00Z'))).toBe('CTR-2042-0001');
  });

  it('FR-CON-05 a refused create does not use up a number', async () => {
    const dealId = await wonDeal(company.A);
    const first = await contractFor(dealId).expect(201);
    const before = Number(first.body.number.split('-')[2]);
    await contractFor(dealId).expect(409);
    const next = await made();
    expect(Number(next.contract.number.split('-')[2])).toBe(before + 1);
  });

  it('NFR-DAT-01 parallel creates for the same deal: one wins, the others are refused, one row exists', async () => {
    const dealId = await wonDeal(company.A);
    const results = await Promise.all([1, 2, 3, 4].map(() => contractFor(dealId)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    expect(await prisma.contract.count({ where: { tenantId, dealId } })).toBe(1);
    // The database's own rule, not only the use case's check.
    await expect(
      prisma.contract.create({
        data: { id: randomUUID(), tenantId, clientId: company.A, planName: 'x', status: 'DRAFT', amount: '1.00', billingPeriod: 'MONTHLY', startsAt: new Date(), endsAt: new Date(), createdByUserId: users.admin, dealId },
      })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('FR-CON-06 the detail response carries every field for a user with commercial details', async () => {
    const { contract } = await made();
    const detail = await as('salesA').get(`/contracts/${contract.id}`).expect(200);
    const view = detail.body.contract;
    for (const field of [
      'number', 'status', 'clientId', 'clientName', 'dealId', 'quotationId', 'assignedUserId', 'packageId', 'packageName', 'servicesSnapshot',
      'startsAt', 'endsAt', 'renewalDate', 'amount', 'agreedAnnualValue', 'discountPercent', 'billingPeriod', 'termsText', 'notes',
      'documentUrl', 'documentName', 'renewedFromContractId', 'paymentSummary',
    ]) {
      expect(view).toHaveProperty(field);
    }
    expect(view.discountPercent === null || typeof view.discountPercent === 'string').toBe(true);
    expect(detail.body).toHaveProperty('history');
    expect(detail.body.history.length).toBeGreaterThan(0);
  });

  it('FR-CON-07 the renewal date defaults to the end date minus the largest lead time: 31 December 2027', async () => {
    const dealId = await wonDeal(company.A);
    const res = await contractFor(dealId, 'salesA', { startsAt: '2027-03-01' }).expect(201);
    expect(res.body.endsAt.slice(0, 10)).toBe('2028-02-29');
    expect(res.body.renewalDate).toBe('2027-12-31');

    const edited = await as('salesA').patch(`/contracts/${res.body.id}`, { renewalDate: '2027-11-15' }).expect(200);
    expect(edited.body.contract.renewalDate).toBe('2027-11-15');
  });

  it('FR-CON-08 lists, searches and filters; a Sales User sees only the contracts of own companies', async () => {
    const a = await made(company.A, 'salesA', { startsAt: '2026-01-01' });
    const b = await made(company.B, 'salesB', { startsAt: '2026-01-01' });
    const ids = (res: request.Response) => (res.body.data as Array<{ id: string }>).map((c) => c.id);

    const own = ids(await as('salesA').get('/contracts?limit=100').expect(200));
    expect(own).toContain(a.contract.id);
    expect(own).not.toContain(b.contract.id);

    expect(ids(await as('salesA').get(`/contracts?query=${a.contract.number}`).expect(200))).toEqual([a.contract.id]);
    expect(ids(await as('admin').get(`/contracts?clientId=${company.B}&limit=100`).expect(200))).toContain(b.contract.id);
    expect(ids(await as('admin').get(`/contracts?assignedUserId=${users.salesB}&limit=100`).expect(200))).toContain(b.contract.id);
    expect(ids(await as('admin').get(`/contracts?status=DRAFT&limit=100`).expect(200))).toContain(a.contract.id);
    expect(ids(await as('admin').get(`/contracts?status=ACTIVE&limit=100`).expect(200))).not.toContain(a.contract.id);
    expect(ids(await as('admin').get(`/contracts?cityId=${tiranaId}&limit=100`).expect(200))).toContain(a.contract.id);
    expect(ids(await as('admin').get(`/contracts?cityId=${randomUUID()}&limit=100`).expect(200))).toEqual([]);
    if (areaId) expect(ids(await as('admin').get(`/contracts?areaId=${areaId}&limit=100`).expect(200))).toContain(a.contract.id);

    const end = a.contract.endsAt.slice(0, 10);
    expect(ids(await as('admin').get(`/contracts?endsFrom=${end}&endsTo=${end}&limit=100`).expect(200))).toContain(a.contract.id);
    expect(ids(await as('admin').get(`/contracts?endsFrom=1999-01-01&endsTo=1999-12-31&limit=100`).expect(200))).toEqual([]);

    await prisma.contractPayment.create({
      data: { id: randomUUID(), tenantId, contractId: a.contract.id, periodIndex: 1, dueDate: new Date('2026-01-01'), amount: '49.40', status: 'OVERDUE' },
    });
    expect(ids(await as('admin').get('/contracts?hasOverdue=true&limit=100').expect(200))).toEqual(expect.arrayContaining([a.contract.id]));
    expect(ids(await as('admin').get('/contracts?hasOverdue=true&limit=100').expect(200))).not.toContain(b.contract.id);
  });

  it('FR-CON-08 "Expiring soon" shows only valid contracts ending in the window', async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const row = (suffix: string, status: string, startOffset: number, endOffset: number) => ({
      id: `cd-validity-${suffix}-${tenantId}`, tenantId, clientId: company.A, assignedUserId: users.salesA, planName: suffix, status, amount: '10.00', billingPeriod: 'MONTHLY',
      startsAt: new Date(day(startOffset)), endsAt: new Date(day(endOffset)), createdByUserId: users.admin,
    });
    await prisma.contract.createMany({
      data: [
        row('soon', 'ACTIVE', -100, 10), // valid, ending in 10 days
        row('far', 'ACTIVE', -100, 200), // valid, ending beyond the window
        row('past', 'ACTIVE', -200, -5), // Active but past its end: not valid
        row('draft', 'DRAFT', -100, 10), // not valid
        row('cancelled', 'CANCELLED', -100, 10), // not valid
        row('notstarted', 'ACTIVE', 30, 300), // not started
      ],
    });
    const plans = async (query: string) =>
      ((await as('admin').get(`/contracts?${query}&limit=100`).expect(200)).body.data as Array<{ planName: string }>)
        .map((c) => c.planName)
        .filter((name) => ['soon', 'far', 'past', 'draft', 'cancelled', 'notstarted'].includes(name))
        .sort();

    expect(await plans('validity=EXPIRING_SOON')).toEqual(['soon']);
    expect(await plans('validity=VALID')).toEqual(['far', 'soon']);
    expect(await plans('validity=NOT_VALID')).toEqual(['cancelled', 'draft', 'notstarted', 'past']);
  });

  it('FR-CON-09 the company timeline shows the contract created by its number', async () => {
    const { contract } = await made(company.A);
    const history = await as('admin').get(`/clients/${company.A}/history?type=CONTRACT`).expect(200);
    const created = (history.body.timeline as any[]).find((entry) => entry.type === 'CONTRACT_CREATED' && entry.details.contractId === contract.id);
    expect(created).toBeDefined();
    expect(created.details.reference).toBe(contract.number);
    expect(created.details.amount).toBe('49.40');
  });

  it('FR-CON-10 a Draft\'s dates are editable, an Active contract\'s end date is refused with "renew", and there is no delete route', async () => {
    const { contract } = await made(company.A, 'salesA', { startsAt: '2026-01-01' });
    const edited = await as('salesA').patch(`/contracts/${contract.id}`, { startsAt: '2026-02-01', endsAt: '2027-01-31', billingPeriod: 'QUARTERLY', notes: 'Agreed by phone' }).expect(200);
    expect(edited.body.contract).toMatchObject({ billingPeriod: 'QUARTERLY', startsAt: '2026-02-01T00:00:00.000Z', endsAt: '2027-01-31T00:00:00.000Z', notes: 'Agreed by phone' });

    // Activating needs the signed document (FR-CON-13).
    await as('salesA').upload(`/contracts/${contract.id}/document`, Buffer.from('%PDF-1.4\n%%EOF')).expect(200);
    await as('salesA').post(`/contracts/${contract.id}/activate`).expect(200);
    const refused = await as('salesA').patch(`/contracts/${contract.id}`, { endsAt: '2028-01-31' }).expect(400);
    expect(refused.body.error).toMatch(/renew/i);
    expect(refused.body.field).toBe('endsAt');
    // The same dates sent back unchanged are not a change; notes and the renewal date still can be.
    await as('salesA').patch(`/contracts/${contract.id}`, { startsAt: '2026-02-01', endsAt: '2027-01-31', notes: 'Signed' }).expect(200);
    await as('salesA').patch(`/contracts/${contract.id}`, { renewalDate: '2026-12-01' }).expect(200);

    const gone = await as('salesA').delete(`/contracts/${contract.id}`);
    expect([404, 405]).toContain(gone.status);
    expect(await prisma.contract.count({ where: { id: contract.id } })).toBe(1);
  });

  it('FR-RBAC-22 a Sales User cannot open the contract of a colleague\'s company by id', async () => {
    const { contract } = await made(company.A, 'salesA');
    await as('salesB').get(`/contracts/${contract.id}`).expect(404);
    await as('salesB').patch(`/contracts/${contract.id}`, { notes: 'x' }).expect(404);
    await as('salesB').post(`/contracts/${contract.id}/refresh-from-deal`).expect(404);
    await as('salesA').get(`/contracts/${contract.id}`).expect(200);
    // Nor can he make one from the colleague's deal.
    const dealOfA = await wonDeal(company.A, 'salesA');
    await contractFor(dealOfA, 'salesB').expect(404);
  });

  it('FR-RBAC-22 Team is the sales team: the Sales Manager sees Sales Users\' contracts, never an Administrator-owned company\'s', async () => {
    const own = await made(company.A, 'salesA');
    const adminOwned = await made(company.admin, 'admin');
    await as('manager').get(`/contracts/${own.contract.id}`).expect(200);
    await as('manager').get(`/contracts/${adminOwned.contract.id}`).expect(404);
    const listed = ((await as('manager').get('/contracts?limit=100').expect(200)).body.data as Array<{ id: string }>).map((c) => c.id);
    expect(listed).toContain(own.contract.id);
    expect(listed).not.toContain(adminOwned.contract.id);
  });

  it('FR-RBAC-21 Reception receives only number, status, validity dates and company; no commercial field', async () => {
    const { contract } = await made(company.A, 'salesA');
    const list = await as('reception').get('/contracts?limit=100').expect(200);
    const row = (list.body.data as any[]).find((c) => c.id === contract.id);
    expect(Object.keys(row).sort()).toEqual(['clientId', 'clientName', 'daysUntilExpiry', 'endsAt', 'id', 'number', 'planName', 'startsAt', 'status']);

    const detail = await as('reception').get(`/contracts/${contract.id}`).expect(200);
    const json = JSON.stringify(detail.body);
    for (const field of ['amount', 'agreedAnnualValue', 'discountPercent', 'servicesSnapshot', 'termsText', 'packageId', 'quotationId', 'dealId', 'renewalDate', 'documentUrl', 'payments']) {
      expect(json).not.toContain(`"${field}"`);
    }
  });

  it('FR-AUD-11 creating from a deal writes a Contract audit entry with the number, in the same transaction', async () => {
    const { contract } = await made();
    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Contract', entityId: contract.id, action: 'CREATE' } });
    expect(entries).toHaveLength(1);
    const changes = entries[0].changes as Array<{ field: string; new: unknown }>;
    expect(changes.find((c) => c.field === 'number')?.new).toBe(contract.number);
    expect(changes.find((c) => c.field === 'dealId')?.new).toBe(contract.dealId);
  });
});
