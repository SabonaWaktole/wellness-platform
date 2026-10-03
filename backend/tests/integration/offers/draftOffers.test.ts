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
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * M2 Slice 8 end to end: the pricing screen calculates on the server from
 * the company record (FR-PRC-01..07, 10..12), and saving it creates or
 * updates the deal's draft offer with its inputs, rule values and amounts
 * (FR-OFR-01, 03, 04, FR-PCF-10), a discount up to the cap (FR-DSC-01, 02,
 * 04) and the first-offer deal move (FR-DEAL-08).
 *
 * The workspace runs the sales process (D6), as Wellness Albania does, so
 * the legacy quotation create is refused.
 */
describe('Pricing screen and draft offers (M2 Slice 8)', () => {
  const tenantId = `t-offers-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-off-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    reception: uid('reception'),
    blind: uid('blind'),
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
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  const companies = {
    tirana: randomUUID(), // Example A: 2 employees, Restaurant (Medium), Tiranë
    kamez: randomUUID(),
    durres: randomUUID(),
    noCity: randomUUID(),
    big: randomUUID(), // 40 employees: no band
    ten: randomUUID(), // 10 employees, for FR-PRC-04
    kavaje: randomUUID(), // a city in no price zone
    other: randomUUID(), // Sales User B's
  };

  const businessTypeId = async (nameSq: string) => (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const riskLevelId = async (level: number) => (await prisma.riskLevel.findFirstOrThrow({ where: { tenantId, level } })).id;
  const frequencyId = async (nameSq: string) => (await prisma.visitFrequency.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const zoneId = async (nameSq: string) => (await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const cityId = async (nameSq: string) => (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const defaultPackage = async () =>
    (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id;

  const newDeal = async (clientId = companies.tirana, who: Who = 'salesA') => {
    const res = await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  /** Example A of the SRS: 2 employees, Medium, 2 visits a year, Tirana centre. */
  const exampleA = async (overrides: object = {}) => ({
    employees: 2,
    businessTypeId: await businessTypeId('Restorant'),
    zoneId: await zoneId('Tirana qendër'),
    frequencyId: await frequencyId('2 herë në vit'),
    packageId: await defaultPackage(),
    ...overrides,
  });
  const calculate = (who: Who, body: object) => as(who).post('/pricing/calculate', body);
  const saveOffer = (who: Who, dealId: string, body: object) => as(who).put(`/deals/${dealId}/offer`, body);
  const offersOf = async (dealId: string, who: Who = 'salesA') =>
    (await as(who).get(`/deals/${dealId}/offers`).expect(200)).body.data as any[];

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Offers tenant', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq' },
    });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);

    // A custom role that prices and sees deals but holds no commercial.view:
    // its responses carry no amounts (FR-RBAC-17).
    const blindRole = `r-off-blind-${randomUUID()}`;
    await prisma.role.create({
      data: {
        id: blindRole, tenantId, key: `blind-${randomUUID()}`, nameSq: 'Pa shifra', nameEn: 'No figures', isSystem: false, baseKey: RoleKey.SalesUser,
        permissions: {
          create: [
            { permissionKey: 'offers.edit', scope: 'ALL' },
            { permissionKey: 'deals.view', scope: 'ALL' },
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
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
        user(users.blind, blindRole, 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    const restaurant = await businessTypeId('Restorant');
    const cafe = await businessTypeId('Kafene');
    const company = (id: string, name: string, employeeCount: number, btId: string | null, city: string | null, assignedUserId = users.salesA) => ({
      id, tenantId, name, assignedUserId, customFieldValues: {}, lastUpdatedByUserId: users.admin,
      employeeCount, businessTypeId: btId, cityId: city,
    });
    await prisma.client.createMany({
      data: [
        company(companies.tirana, 'Restorant Tirana', 2, restaurant, await cityId('Tiranë')),
        company(companies.kamez, 'Restorant Kamëz', 5, restaurant, await cityId('Kamëz')),
        company(companies.durres, 'Kafe Durrës', 3, cafe, await cityId('Durrës')),
        company(companies.noCity, 'Kafe pa qytet', 2, cafe, null),
        company(companies.big, 'Kafe e madhe', 40, cafe, await cityId('Tiranë')),
        company(companies.ten, 'Kafe dhjetë', 10, cafe, await cityId('Tiranë')),
        company(companies.kavaje, 'Kafe Kavajë', 2, cafe, await cityId('Kavajë')),
        company(companies.other, 'Restorant B', 2, restaurant, await cityId('Tiranë'), users.salesB),
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('calculating (FR-PRC-01..07, 10, 12)', () => {
    it('FR-PRC-01 POST /pricing/calculate returns the Example A breakdown, calculated on the server', async () => {
      const res = await calculate('salesA', { clientId: companies.tirana, ...(await exampleA()) });
      expect(res.status).toBe(200);
      expect(res.body.data.result).toEqual({
        kind: 'PRICED',
        baseFee: '38.00',
        riskFee: '3.80',
        visitFee: '7.60',
        locationFee: '0.00',
        listPrice: '49.40',
        discountPercent: '0.00',
        discountAmount: '0.00',
        netMonthlyPrice: '49.40',
        pricePerEmployee: '24.70',
        annualValue: '592.80',
      });
      expect(res.body.data.subject).toMatchObject({ clientId: companies.tirana, companyName: 'Restorant Tirana', employeeCount: 2 });
    });

    it('FR-PRC-02 inputs are pre-filled from the company: a Kamëz company gets city Kamëz and its one zone', async () => {
      const { body } = await calculate('salesA', { clientId: companies.kamez }).expect(200);
      expect(body.data.subject.city).toMatchObject({ nameSq: 'Kamëz' });
      expect(body.data.options.zones).toEqual([
        expect.objectContaining({ id: await zoneId('Kamëz dhe Vorë'), nameSq: 'Kamëz dhe Vorë', surchargePercent: '30.00' }),
      ]);
      expect(body.data.inputs).toMatchObject({
        employees: 5,
        businessTypeId: await businessTypeId('Restorant'),
        zoneId: await zoneId('Kamëz dhe Vorë'),
        riskLevel: expect.objectContaining({ level: 2 }),
      });
      // Nothing to price with until a frequency is chosen.
      expect(body.data.result).toEqual({ kind: 'INPUT_REQUIRED', missing: ['frequencyId'] });
    });

    it('FR-PRC-02 a company without a city asks for the company to be completed', async () => {
      const { body } = await calculate('salesA', { clientId: companies.noCity, frequencyId: await frequencyId('2 herë në vit') }).expect(200);
      expect(body.data.result).toEqual({ kind: 'COMPANY_INCOMPLETE', missing: ['cityId'] });
    });

    it('FR-PRC-03 a High-risk business type adds 20% of the base fee, and a risk level sent in the body is ignored', async () => {
      const { body } = await calculate('salesA', {
        clientId: companies.tirana,
        ...(await exampleA({ businessTypeId: await businessTypeId('Ndërtim') })),
        riskLevelId: await riskLevelId(1),
      }).expect(200);
      expect(body.data.inputs.riskLevel).toMatchObject({ level: 3 });
      expect(body.data.result).toMatchObject({ baseFee: '38.00', riskFee: '7.60', listPrice: '53.20' });
    });

    it('FR-PRC-05 only active frequencies are offered, in the configured order', async () => {
      const once = await frequencyId('1 herë në vit');
      await as('admin').post(`/pricing/frequencies/${once}/deactivate`).expect(200);
      try {
        const { body } = await calculate('salesA', { clientId: companies.tirana }).expect(200);
        const expected = await prisma.visitFrequency.findMany({ where: { tenantId, active: true }, orderBy: { order: 'asc' } });
        expect(body.data.options.frequencies.map((f: any) => f.id)).toEqual(expected.map((f) => f.id));
        expect(body.data.options.frequencies.map((f: any) => f.id)).not.toContain(once);
      } finally {
        await as('admin').post(`/pricing/frequencies/${once}/reactivate`).expect(200);
      }
    });

    it('FR-PRC-06 Tiranë needs a zone choice between its two zones; Durrës is set with no choice', async () => {
      const tirana = (await calculate('salesA', { clientId: companies.tirana, frequencyId: await frequencyId('2 herë në vit') }).expect(200)).body.data;
      expect(tirana.options.zones.map((z: any) => z.nameSq).sort()).toEqual(['Tirana periferi', 'Tirana qendër']);
      expect(tirana.inputs.zoneId).toBeNull();
      expect(tirana.result).toEqual({ kind: 'INPUT_REQUIRED', missing: ['zoneId'] });

      const durres = (await calculate('salesA', { clientId: companies.durres, frequencyId: await frequencyId('2 herë në vit') }).expect(200)).body.data;
      expect(durres.options.zones).toHaveLength(1);
      expect(durres.inputs.zoneId).toBe(await zoneId('Elbasan dhe Durrës'));
      expect(durres.result.kind).toBe('PRICED');
    });

    it('FR-PRC-06 a zone the city is not in is refused', async () => {
      const res = await calculate('salesA', { clientId: companies.durres, ...(await exampleA()) });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_PRICING_INPUT', field: 'zoneId' });
    });

    it('FR-PRC-07 40 employees with no band for 40 gives "Price on request"; a city in no zone too', async () => {
      const big = (await calculate('salesA', { clientId: companies.big, ...(await exampleA({ employees: 40 })) }).expect(200)).body.data;
      expect(big.result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' });

      const kavaje = (await calculate('salesA', { clientId: companies.kavaje, frequencyId: await frequencyId('2 herë në vit') }).expect(200)).body.data;
      expect(kavaje.options.zones).toEqual([]);
      expect(kavaje.result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' });
    });

    it('FR-PRC-10 the screen shows €24.70 per employee and €592.80 a year for Example A', async () => {
      const { body } = await calculate('salesA', { clientId: companies.tirana, ...(await exampleA()) }).expect(200);
      expect(body.data.result).toMatchObject({ pricePerEmployee: '24.70', annualValue: '592.80' });
    });

    it('FR-PRC-12 calculating, even from a deal, creates no offer', async () => {
      const dealId = await newDeal();
      const before = await prisma.quotation.count({ where: { tenantId } });
      await calculate('salesA', { dealId, ...(await exampleA()) }).expect(200);
      expect(await prisma.quotation.count({ where: { tenantId } })).toBe(before);
    });

    it('FR-DSC-01 Example A with 10% shows a discount of €4.94 and a net price of €44.46', async () => {
      const { body } = await calculate('salesA', { clientId: companies.tirana, ...(await exampleA({ discountPercent: '10' })) }).expect(200);
      expect(body.data.result).toMatchObject({ discountPercent: '10.00', discountAmount: '4.94', netMonthlyPrice: '44.46', annualValue: '533.52' });
      expect(body.data.discountAboveCap).toBe(false);
      expect(body.data.options.discountCapPercent).toBe('10.00');
    });

    it('FR-DSC-04 the calculation shows a discount above the cap as such', async () => {
      const { body } = await calculate('salesA', { clientId: companies.tirana, ...(await exampleA({ discountPercent: '20' })) }).expect(200);
      expect(body.data.discountAboveCap).toBe(true);
    });

    it('FR-PRC-11 the active packages are offered with their services, the default first', async () => {
      const { body } = await calculate('salesA', { clientId: companies.tirana }).expect(200);
      expect(body.data.options.packages[0]).toMatchObject({ id: await defaultPackage(), isDefault: true });
      expect(body.data.options.packages[0].services.length).toBeGreaterThan(0);
      expect(body.data.inputs.packageId).toBe(await defaultPackage());
    });

    it('NFR-PERF-02 a calculation returns in under 300 ms', async () => {
      const body = { clientId: companies.tirana, ...(await exampleA()) };
      await calculate('salesA', body).expect(200); // warm the route
      const started = Date.now();
      await calculate('salesA', body).expect(200);
      expect(Date.now() - started).toBeLessThan(300);
    });

    it('NFR-SEC-04 a Sales User cannot price another salesperson\'s company or deal', async () => {
      expect((await calculate('salesA', { clientId: companies.other })).status).toBe(404);
      const theirs = await newDeal(companies.other, 'salesB');
      expect((await calculate('salesA', { dealId: theirs })).status).toBe(404);
      expect((await calculate('manager', { dealId: theirs })).status).toBe(200);
    });

    it('a calculation names exactly one of a deal or a company', async () => {
      expect((await calculate('salesA', {})).status).toBe(400);
      const dealId = await newDeal();
      expect((await calculate('salesA', { dealId, clientId: companies.tirana })).status).toBe(400);
    });
  });

  describe('saving the draft offer (FR-OFR-01, 03, 04, FR-PRC-04, 11, FR-DSC-02, 04, FR-DEAL-08)', () => {
    it('FR-DEAL-08 the first offer creates the deal\'s draft and moves the deal to Offer Prepared', async () => {
      const dealId = await newDeal();
      const res = await saveOffer('salesA', dealId, { ...(await exampleA()), note: 'Pagesa çdo tremujor' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        dealId,
        clientId: companies.tirana,
        status: 'DRAFT',
        language: 'sq',
        note: 'Pagesa çdo tremujor',
        employeesPriced: 2,
        listPrice: '49.40',
        netMonthlyPrice: '49.40',
      });

      const deal = (await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data;
      expect(deal.stage).toBe('OFFER_PREPARED');
      expect(deal.history.at(-1)).toMatchObject({ fromStage: 'NEW_LEAD', toStage: 'OFFER_PREPARED', changedByUserId: null });
    });

    it('FR-DEAL-08 a deal in Negotiation stays there when its offer is saved', async () => {
      const dealId = await newDeal();
      await as('salesA').post(`/deals/${dealId}/stage`, { stage: 'NEGOTIATION' }).expect(200);
      await saveOffer('salesA', dealId, await exampleA()).expect(201);
      expect((await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data.stage).toBe('NEGOTIATION');
    });

    it('FR-PRC-12 saving again updates the same draft instead of creating another', async () => {
      const dealId = await newDeal();
      const first = (await saveOffer('salesA', dealId, await exampleA()).expect(201)).body.data;
      const second = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '5', note: 'Ndryshuar' }));
      expect(second.status).toBe(200);
      expect(second.body.data).toMatchObject({ id: first.id, discountPercent: '5.00', discountAmount: '2.47', netMonthlyPrice: '46.93', note: 'Ndryshuar' });
      expect(await offersOf(dealId)).toHaveLength(1);
    });

    it('FR-OFR-01 an offer belongs to a deal: there is none to save on without one', async () => {
      expect((await saveOffer('salesA', randomUUID(), await exampleA())).status).toBe(404);
    });

    it('FR-OFR-01 the legacy quotation create is refused under the sales process', async () => {
      const res = await as('admin').post('/quotations', {
        clientId: companies.tirana,
        lineItems: [{ productId: randomUUID(), warehouseId: randomUUID(), quantity: 1, unitPrice: 10 }],
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'USE_DEAL_OFFERS' });
    });

    it('FR-OFR-01 offers stay out of the legacy quotation routes, which cannot handle them', async () => {
      const dealId = await newDeal();
      const offer = (await saveOffer('salesA', dealId, await exampleA()).expect(201)).body.data;
      expect((await as('admin').get(`/quotations/${offer.id}`)).status).toBe(404);
      const list = await as('admin').get('/quotations?limit=100').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(offer.id);
    });

    it('FR-OFR-03 amounts sent in the body are ignored: the server calculates them', async () => {
      const dealId = await newDeal();
      const { body } = await saveOffer('salesA', dealId, {
        ...(await exampleA()),
        listPrice: '1.00',
        netMonthlyPrice: '1.00',
        baseFee: '1.00',
        riskLevelId: await riskLevelId(1),
      }).expect(201);
      expect(body.data).toMatchObject({ baseFee: '38.00', riskFee: '3.80', listPrice: '49.40', netMonthlyPrice: '49.40' });
    });

    it('FR-OFR-04 the offer stores its inputs with their labels, the rule values used and the amounts', async () => {
      const dealId = await newDeal();
      const { body } = await saveOffer('salesA', dealId, await exampleA()).expect(201);
      expect(body.data.pricingInputs).toMatchObject({
        employees: 2,
        businessType: { id: await businessTypeId('Restorant'), nameSq: 'Restorant', nameEn: 'Restaurant' },
        riskLevel: { id: await riskLevelId(2), level: 2 },
        city: { nameSq: 'Tiranë' },
        area: { nameSq: 'Tiranë' },
        zone: { id: await zoneId('Tirana qendër'), nameSq: 'Tirana qendër' },
        frequency: { id: await frequencyId('2 herë në vit'), nameSq: '2 herë në vit' },
        package: { id: await defaultPackage() },
      });
      expect(body.data.ruleSnapshot).toEqual({
        schemaVersion: 1,
        currency: 'EUR',
        band: { minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00' },
        riskSurchargePercent: '10.00',
        frequency: { pricingType: 'PERCENT', frequencyValue: '20.00' },
        surchargePercent: '0.00',
        discountCapPercent: '10.00',
        contractMonths: 12,
        offerValidityDays: 30,
      });
    });

    it('FR-OFR-04 FR-PCF-10 raising the base fee leaves a saved offer\'s amounts and snapshot unchanged', async () => {
      const dealId = await newDeal();
      await saveOffer('salesA', dealId, await exampleA()).expect(201);
      const band = await prisma.employeeBand.findFirstOrThrow({ where: { tenantId, minEmployees: 1 } });
      await as('admin').patch(`/pricing/bands/${band.id}`, { baseFee: '35.00' }).expect(200);
      try {
        const [offer] = await offersOf(dealId);
        expect(offer).toMatchObject({ baseFee: '38.00', listPrice: '49.40', netMonthlyPrice: '49.40' });
        expect(offer.ruleSnapshot.band.baseFee).toBe('30.00');
        // The next calculation uses the new fee.
        const fresh = (await calculate('salesA', { dealId, ...(await exampleA()) }).expect(200)).body.data.result;
        expect(fresh.baseFee).toBe('43.00');
      } finally {
        await as('admin').patch(`/pricing/bands/${band.id}`, { baseFee: '30.00' }).expect(200);
      }
    });

    it('FR-PRC-04 pricing 12 employees for a company of 10 leaves the company at 10', async () => {
      const dealId = await newDeal(companies.ten);
      const { body } = await saveOffer('salesA', dealId, await exampleA({ employees: 12, businessTypeId: await businessTypeId('Kafene') })).expect(201);
      expect(body.data.employeesPriced).toBe(12);
      expect((await prisma.client.findUniqueOrThrow({ where: { id: companies.ten } })).employeeCount).toBe(10);
    });

    it('FR-PRC-04 with "also update the company" the company becomes 12, audited', async () => {
      const dealId = await newDeal(companies.ten);
      await saveOffer('salesA', dealId, { ...(await exampleA({ employees: 12, businessTypeId: await businessTypeId('Kafene') })), alsoUpdateCompany: true }).expect(201);
      expect((await prisma.client.findUniqueOrThrow({ where: { id: companies.ten } })).employeeCount).toBe(12);
      const audit = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'Client', entityId: companies.ten } });
      expect(audit).toMatchObject({ action: 'UPDATE', userId: users.salesA });
      expect(audit.changes).toEqual([{ field: 'employeeCount', old: 10, new: 12 }]);
    });

    it('FR-PRC-07 a "Price on request" draft is saved without amounts', async () => {
      const dealId = await newDeal(companies.big);
      const { body } = await saveOffer('salesA', dealId, await exampleA({ employees: 40, businessTypeId: await businessTypeId('Kafene') })).expect(201);
      expect(body.data).toMatchObject({ status: 'DRAFT', listPrice: null, netMonthlyPrice: null, priceOnRequest: 'NO_BAND' });
    });

    it('FR-PRC-11 the chosen package\'s services are the offer\'s lines, in order', async () => {
      const dealId = await newDeal();
      const { body } = await saveOffer('salesA', dealId, await exampleA()).expect(201);
      const pkg = await prisma.servicePackage.findFirstOrThrow({
        where: { tenantId, isDefault: true },
        include: { services: { orderBy: { order: 'asc' }, include: { service: true } } },
      });
      expect(body.data.services.map((s: any) => s.nameSq)).toEqual(pkg.services.map((ps) => ps.service.nameSq));
      expect(body.data.packageId).toBe(pkg.id);
    });

    it('FR-DSC-02 10% with a 10% cap saves as a normal draft', async () => {
      const dealId = await newDeal();
      const { body } = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '10' })).expect(201);
      expect(body.data).toMatchObject({ status: 'DRAFT', discountPercent: '10.00', discountAmount: '4.94', netMonthlyPrice: '44.46' });
    });

    it('FR-DSC-04 20% posted directly returns a validation error, and nothing is saved', async () => {
      const dealId = await newDeal();
      const res = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '20' }));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'DISCOUNT_ABOVE_CAP', field: 'discountPercent' });
      expect(await offersOf(dealId)).toEqual([]);
    });

    it('a draft needs every input chosen', async () => {
      const dealId = await newDeal();
      const res = await saveOffer('salesA', dealId, await exampleA({ zoneId: null }));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_PRICING_INPUT', field: 'zoneId' });
    });

    it('a closed deal takes no new offer', async () => {
      const dealId = await newDeal();
      await prisma.deal.update({ where: { id: dealId }, data: { stageKey: 'LOST', closedAt: new Date() } });
      expect((await saveOffer('salesA', dealId, await exampleA())).status).toBe(409);
    });

    it('NFR-ACC-02 offer amounts round-trip as strings, stored as Decimal with no float drift', async () => {
      const dealId = await newDeal();
      const { body } = await saveOffer('salesA', dealId, await exampleA({ discountPercent: '10' })).expect(201);
      const row = await prisma.quotation.findUniqueOrThrow({ where: { id: body.data.id } });
      expect(row.netMonthlyPrice!.toFixed(2)).toBe('44.46');
      expect(row.discountAmount!.toFixed(2)).toBe('4.94');
      const [offer] = await offersOf(dealId);
      expect(typeof offer.netMonthlyPrice).toBe('string');
      expect(offer.netMonthlyPrice).toBe('44.46');
    });

    it('NFR-SEC-04 a Sales User cannot save or read an offer on another salesperson\'s deal', async () => {
      const theirs = await newDeal(companies.other, 'salesB');
      expect((await saveOffer('salesA', theirs, await exampleA())).status).toBe(404);
      expect((await as('salesA').get(`/deals/${theirs}/offers`)).status).toBe(404);
      expect((await saveOffer('salesB', theirs, await exampleA())).status).toBe(201);
    });
  });

  describe('the deal\'s offers and value (FR-DEAL-03, 10, 11, FR-RBAC-17)', () => {
    it('FR-DEAL-03 the deal page lists its offers', async () => {
      const dealId = await newDeal();
      const saved = (await saveOffer('salesA', dealId, await exampleA())).body.data;
      const offers = await offersOf(dealId);
      expect(offers).toEqual([expect.objectContaining({ id: saved.id, status: 'DRAFT', listPrice: '49.40', createdByUserId: users.salesA })]);
    });

    it('FR-OFR-01 the offer shows in the company history with its net monthly price', async () => {
      const dealId = await newDeal();
      const offer = (await saveOffer('salesA', dealId, await exampleA({ discountPercent: '10' })).expect(201)).body.data;
      const timeline = (await as('salesA').get(`/clients/${companies.tirana}/history?limit=100`).expect(200)).body.timeline as any[];
      expect(timeline.find((entry) => entry.id === `quotation:${offer.id}`)).toMatchObject({
        type: 'QUOTATION_CREATED',
        details: { quotationId: offer.id, status: 'DRAFT', total: 44.46 },
      });
    });

    it('FR-DEAL-10 the deal carries its offer\'s value onto the board, the card and the column total', async () => {
      const dealId = await newDeal();
      await saveOffer('salesA', dealId, await exampleA({ discountPercent: '10' })).expect(201);
      const deal = (await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data;
      expect(deal).toMatchObject({ netMonthlyPrice: '44.46', annualValue: '533.52' });

      const board = (await as('salesA').get('/deals/board').expect(200)).body.data;
      const column = board.columns.find((c: any) => c.stage === 'OFFER_PREPARED');
      const expected = await prisma.deal.aggregate({
        where: { tenantId, ownerUserId: users.salesA, stageKey: 'OFFER_PREPARED', deletedAt: null },
        _sum: { offerNetMonthlyPrice: true },
      });
      expect(column.totalNetMonthlyPrice).toBe(expected._sum.offerNetMonthlyPrice!.toFixed(2));
      expect(column.items.find((card: any) => card.id === dealId)).toMatchObject({ netMonthlyPrice: '44.46' });
      expect(board.columns.find((c: any) => c.stage === 'WON').totalNetMonthlyPrice).toBeNull();
    });

    it('FR-DEAL-11 the list filters and sorts by value', async () => {
      const cheap = await newDeal();
      await saveOffer('salesA', cheap, await exampleA({ discountPercent: '10' })).expect(201); // 44.46
      const dear = await newDeal();
      await saveOffer('salesA', dear, await exampleA({ businessTypeId: await businessTypeId('Ndërtim') })).expect(201); // 53.20

      const ids = async (query: string) =>
        ((await as('salesA').get(`/deals?${query}&pageSize=100`).expect(200)).body.data.items as any[]).map((d) => d.id);
      const above50 = await ids('valueMin=50');
      expect(above50).toContain(dear);
      expect(above50).not.toContain(cheap);
      const upTo45 = await ids('valueMax=45');
      expect(upTo45).toContain(cheap);
      expect(upTo45).not.toContain(dear);

      const sorted = await ids('valueMin=40&sort=value&direction=desc');
      expect(sorted.indexOf(dear)).toBeLessThan(sorted.indexOf(cheap));
    });

    it('FR-RBAC-17 Reception gets 403 on the pricing screen and the offer routes', async () => {
      const dealId = await newDeal();
      expect((await calculate('reception', { clientId: companies.tirana })).status).toBe(403);
      expect((await saveOffer('reception', dealId, await exampleA())).status).toBe(403);
      expect((await as('reception').get(`/deals/${dealId}/offers`)).status).toBe(403);
    });

    it('FR-RBAC-17 a role without commercial.view prices with no figures in the response', async () => {
      const res = await calculate('blind', { clientId: companies.tirana, ...(await exampleA()) });
      expect(res.status).toBe(200);
      expect(res.body.data.result.kind).toBe('PRICED');
      expectNoCommercialFields(res.body);
      expect((await as('blind').get(`/deals/${await newDeal()}/offers`)).status).toBe(403);
    });
  });

  describe('pricing values used by an offer (Slice 3: in use)', () => {
    it('a frequency or zone an offer used cannot be deleted, only deactivated', async () => {
      const dealId = await newDeal();
      await saveOffer('salesA', dealId, await exampleA()).expect(201);
      const frequency = await as('admin').delete(`/pricing/frequencies/${await frequencyId('2 herë në vit')}`);
      expect(frequency.status).toBe(409);
      expect(frequency.body).toMatchObject({ code: 'PRICING_ITEM_IN_USE' });
      expect((await as('admin').delete(`/pricing/zones/${await zoneId('Tirana qendër')}`)).status).toBe(409);
    });

    it('a package an offer used cannot be deleted', async () => {
      const service = await prisma.service.findFirstOrThrow({ where: { tenantId, active: true } });
      const created = await as('admin').post('/pricing/packages', { nameSq: 'Paketa e vogël', serviceIds: [service.id] }).expect(201);
      const dealId = await newDeal();
      await saveOffer('salesA', dealId, await exampleA({ packageId: created.body.item.id })).expect(201);
      const res = await as('admin').delete(`/pricing/packages/${created.body.item.id}`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'PRICING_ITEM_IN_USE' });
    });
  });
});
