import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaPricingWriteTransaction } from '../../../src/pricing/infrastructure/PrismaPricingWriteTransaction';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * M2 Slice 3 end to end (FR-PCF-01..05, 07, 09; FR-AUD-09; UAT-5 step 2):
 * the Administrator manages every number of the pricing model from Settings →
 * Pricing, sees the cities in no zone, and tries the configuration in the test
 * calculator. Every write is one audit entry in the same transaction.
 */
describe('Pricing configuration (FR-PCF-01..05, 07, 09)', () => {
  const tenantId = `t-pricing-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-pricing-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), reception: uid('reception'), sales: uid('sales'), pricer: uid('pricer') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}/pricing${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}/pricing${path}`)).send(body),
      patch: (path: string, body: object) => auth(request(app).patch(`/api/${slug}/pricing${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}/pricing${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}/pricing${path}`)),
    };
  };

  const riskLevelId = async (level: number) => (await prisma.riskLevel.findFirstOrThrow({ where: { tenantId, level } })).id;
  const frequencyId = async (nameSq: string) => (await prisma.visitFrequency.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const zoneId = async (nameSq: string) => (await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const cityId = async (nameSq: string, areaNameSq: string) =>
    (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq, area: { nameSq: areaNameSq } } })).id;
  const auditCount = () => prisma.auditEntry.count({ where: { tenantId } });
  const latestAudit = () => prisma.auditEntry.findFirstOrThrow({ where: { tenantId }, orderBy: { at: 'desc' } });

  /** Example A of the SRS: 2 employees, Medium, 2 visits a year, Tirana centre. */
  const exampleA = async () => ({
    employees: 2,
    riskLevelId: await riskLevelId(2),
    frequencyId: await frequencyId('2 herë në vit'),
    zoneId: await zoneId('Tirana qendër'),
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Pricing tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    // Provisioning order: the pricing seed points at the seeded risk levels and cities.
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);

    // A custom role that may manage pricing but not see commercial details:
    // the responses still carry no amounts (FR-RBAC-17).
    const pricerRoleId = randomUUID();
    await prisma.role.create({
      data: {
        id: pricerRoleId,
        tenantId,
        key: `CUSTOM_${pricerRoleId}`,
        nameSq: 'Çmimet pa shifra',
        nameEn: 'Pricing without figures',
        permissions: { create: [{ permissionKey: 'pricing.manage' }] },
      },
    });

    const user = (id: string, roleId: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator]),
        user(users.reception, roles[RoleKey.Reception]),
        user(users.sales, roles[RoleKey.SalesUser]),
        user(users.pricer, pricerRoleId),
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-PCF-01 FR-PCF-02 FR-PCF-04 FR-PCF-05 FR-PCF-07 a new workspace starts with the Figure 1 model', async () => {
    const { body } = await as('admin').get('/config').expect(200);
    const config = body.data;

    expect(config.currency).toBe('EUR');
    expect(config.discountCapPercent).toBe('10.00');
    expect(config.bands).toEqual([
      expect.objectContaining({ minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00', active: true }),
    ]);
    expect(config.riskSurcharges.map((r: any) => [r.level, r.riskSurchargePercent])).toEqual([
      [1, '0.00'],
      [2, '10.00'],
      [3, '20.00'],
    ]);
    expect(config.frequencies.map((f: any) => [f.nameEn, f.pricingType, f.frequencyValue])).toEqual([
      ['Once a year', 'PERCENT', '0.00'],
      ['Twice a year', 'PERCENT', '20.00'],
      ['4 times a year', 'PERCENT', '35.00'],
      ['6 times a year', 'PERCENT', '50.00'],
      ['Monthly', 'PERCENT', '100.00'],
      ['Ad hoc', 'FIXED', '15.00'],
    ]);

    const tirane = await cityId('Tiranë', 'Tiranë');
    const zones = Object.fromEntries(config.zones.map((z: any) => [z.nameEn, z]));
    expect(zones['Tirana centre']).toMatchObject({ surchargePercent: '0.00', cityIds: [tirane] });
    expect(zones['Tirana suburbs']).toMatchObject({ surchargePercent: '15.00', cityIds: [tirane] });
    expect(zones['Kamëz and Vorë'].cityIds.sort()).toEqual([await cityId('Kamëz', 'Tiranë'), await cityId('Vorë', 'Tiranë')].sort());
    expect(zones['Elbasan and Durrës'].cityIds.sort()).toEqual(
      [await cityId('Elbasan', 'Elbasan'), await cityId('Durrës', 'Durrës')].sort()
    );
  });

  it('FR-PCF-09 Example A in the test calculator gives €49.40, and nothing is stored', async () => {
    const before = await Promise.all([auditCount(), prisma.employeeBand.count({ where: { tenantId } })]);

    const { body } = await as('admin').post('/test-calculation', await exampleA()).expect(200);

    expect(body.result).toEqual({
      kind: 'PRICED',
      baseFee: '38.00',
      riskFee: '3.80',
      visitFee: '7.60',
      locationFee: '0.00',
      listPrice: '49.40',
      pricePerEmployee: '24.70',
      annualValue: '592.80',
    });
    expect(await Promise.all([auditCount(), prisma.employeeBand.count({ where: { tenantId } })])).toEqual(before);
  });

  it('FR-PCF-09 Example B: 5 employees, High, monthly, Kamëz gives €155.00', async () => {
    const { body } = await as('admin')
      .post('/test-calculation', {
        employees: 5,
        riskLevelId: await riskLevelId(3),
        frequencyId: await frequencyId('Çdo muaj'),
        zoneId: await zoneId('Kamëz dhe Vorë'),
      })
      .expect(200);
    expect(body.result).toMatchObject({ baseFee: '62.00', riskFee: '12.40', visitFee: '62.00', locationFee: '18.60', listPrice: '155.00' });
  });

  it('FR-PCF-01 an overlapping band is refused with a clear message; adding 11–50 makes 30 employees priceable', async () => {
    const inputs = { ...(await exampleA()), employees: 30 };
    expect((await as('admin').post('/test-calculation', inputs).expect(200)).body.result).toEqual({
      kind: 'PRICE_ON_REQUEST',
      reason: 'NO_BAND',
    });

    const overlap = await as('admin').post('/bands', { minEmployees: 5, maxEmployees: 20, baseFee: '90', perEmployeeFee: '6' }).expect(400);
    expect(overlap.body).toMatchObject({ code: 'BANDS_OVERLAP', overlapsWith: { minEmployees: 1, maxEmployees: 10 } });
    expect(overlap.body.error).toMatch(/overlaps the band 1–10/);

    const created = await as('admin').post('/bands', { minEmployees: 11, maxEmployees: 50, baseFee: '100', perEmployeeFee: 6 }).expect(201);
    expect(created.body.item).toMatchObject({ minEmployees: 11, maxEmployees: 50, baseFee: '100.00', perEmployeeFee: '6.00', active: true });

    // 100.00 for the 11th employee's band formula + 6.00 × 29 extra employees.
    const { body } = await as('admin').post('/test-calculation', inputs).expect(200);
    expect(body.result).toMatchObject({ kind: 'PRICED', baseFee: '274.00' });
  });

  it('FR-PCF-02 changing Medium from 10% to 12% changes the next calculation (UAT-5 step 2)', async () => {
    const medium = await riskLevelId(2);
    const res = await as('admin').put(`/risk-surcharges/${medium}`, { riskSurchargePercent: '12' }).expect(200);
    expect(res.body.item).toMatchObject({ riskLevelId: medium, level: 2, riskSurchargePercent: '12.00' });

    const { body } = await as('admin').post('/test-calculation', await exampleA()).expect(200);
    expect(body.result).toMatchObject({ riskFee: '4.56', listPrice: '50.16' });

    const entry = await latestAudit();
    expect(entry).toMatchObject({ entityType: 'RiskSurcharge', action: 'UPDATE', userId: users.admin });
    expect(entry.changes).toEqual([{ field: 'riskSurchargePercent', old: '10.00', new: '12.00' }]);

    await as('admin').put(`/risk-surcharges/${medium}`, { riskSurchargePercent: '10' }).expect(200);
  });

  it.each([
    ['a negative fee', '/bands', { minEmployees: 60, maxEmployees: 70, baseFee: '-1', perEmployeeFee: '1' }, 'INVALID_FEE'],
    ['a non-numeric fee', '/bands', { minEmployees: 60, maxEmployees: 70, baseFee: 'thirty', perEmployeeFee: '1' }, 'INVALID_FEE'],
    ['a three-decimal fee', '/bands', { minEmployees: 60, maxEmployees: 70, baseFee: '30.005', perEmployeeFee: '1' }, 'INVALID_FEE'],
    ['a reversed band', '/bands', { minEmployees: 70, maxEmployees: 60, baseFee: '30', perEmployeeFee: '1' }, 'INVALID_BAND_RANGE'],
    ['a surcharge above 1000%', '/zones', { nameSq: 'Larg', surchargePercent: '1000.01' }, 'INVALID_PERCENT'],
    ['a negative percentage', '/frequencies', { nameSq: 'Rrallë', pricingType: 'PERCENT', frequencyValue: '-5' }, 'INVALID_PERCENT'],
  ])('FR-PCF-03 refuses %s', async (_label, path, body, code) => {
    const res = await as('admin').post(path, body).expect(400);
    expect(res.body.code).toBe(code);
  });

  it('FR-PCF-03 a non-numeric risk surcharge or discount cap is refused', async () => {
    const medium = await riskLevelId(2);
    expect((await as('admin').put(`/risk-surcharges/${medium}`, { riskSurchargePercent: 'ten' }).expect(400)).body.code).toBe(
      'INVALID_PERCENT'
    );
    expect((await as('admin').put('/discount-cap', { discountCapPercent: '101' }).expect(400)).body.code).toBe('INVALID_PERCENT');
  });

  it('FR-PCF-04 a new frequency "3 per year, 28%" is available at once', async () => {
    const created = await as('admin')
      .post('/frequencies', { nameSq: '3 herë në vit', nameEn: '3 per year', visitsPerYear: 3, pricingType: 'PERCENT', frequencyValue: '28' })
      .expect(201);
    expect(created.body.item).toMatchObject({ frequencyValue: '28.00', order: 7, active: true });

    const config = (await as('admin').get('/config').expect(200)).body.data;
    expect(config.frequencies.map((f: any) => f.nameEn)).toContain('3 per year');

    const { body } = await as('admin')
      .post('/test-calculation', { ...(await exampleA()), frequencyId: created.body.item.id })
      .expect(200);
    // 28% of the €38.00 base fee.
    expect(body.result).toMatchObject({ visitFee: '10.64' });

    expect(
      (await as('admin').post('/frequencies', { nameSq: '3 HERË NË VIT', pricingType: 'FIXED', frequencyValue: '1' }).expect(409)).body.code
    ).toBe('PRICING_VALUE_TAKEN');
  });

  it('FR-PCF-04 a deactivated frequency cannot be used, and reactivates', async () => {
    const adHoc = await frequencyId('Sipas nevojës');
    await as('admin').post(`/frequencies/${adHoc}/deactivate`).expect(200);
    const refused = await as('admin').post('/test-calculation', { ...(await exampleA()), frequencyId: adHoc }).expect(400);
    expect(refused.body).toMatchObject({ code: 'INVALID_PRICING_VALUE', field: 'frequencyId' });

    await as('admin').post(`/frequencies/${adHoc}/reactivate`).expect(200);
    const { body } = await as('admin').post('/test-calculation', { ...(await exampleA()), frequencyId: adHoc }).expect(200);
    expect(body.result).toMatchObject({ visitFee: '15.00' });
  });

  it('FR-PCF-05 an active city in no zone is listed as a warning until a zone takes it', async () => {
    const shkoder = await cityId('Shkodër', 'Shkodër');
    const listed = async () => (await as('admin').get('/cities-without-zone').expect(200)).body.data.map((c: any) => c.id);

    expect(await listed()).toContain(shkoder);
    expect(await listed()).not.toContain(await cityId('Kamëz', 'Tiranë'));

    const centre = await zoneId('Tirana qendër');
    const tirane = await cityId('Tiranë', 'Tiranë');
    const res = await as('admin').put(`/zones/${centre}/cities`, { cityIds: [tirane, shkoder] }).expect(200);
    expect(res.body.item.cityIds).toEqual(expect.arrayContaining([tirane, shkoder]));
    expect(await listed()).not.toContain(shkoder);

    const entry = await latestAudit();
    expect(entry).toMatchObject({ entityType: 'PriceZone', entityLabel: 'Tirana qendër', action: 'UPDATE' });
    expect(entry.changes).toEqual([{ field: 'cities', old: ['Tiranë (Tiranë)'], new: ['Shkodër (Shkodër)', 'Tiranë (Tiranë)'] }]);

    await as('admin').put(`/zones/${centre}/cities`, { cityIds: [tirane] }).expect(200);
  });

  it('FR-PCF-05 a zone takes only active cities of this workspace', async () => {
    const centre = await zoneId('Tirana qendër');
    const res = await as('admin').put(`/zones/${centre}/cities`, { cityIds: ['not-a-city'] }).expect(400);
    expect(res.body.code).toBe('CITY_NOT_ACTIVE');
  });

  it('FR-PCF-05 a deactivated zone prices as "Price on request"', async () => {
    const newZone = await as('admin').post('/zones', { nameSq: 'Zonë e re', surchargePercent: '5' }).expect(201);
    await as('admin').post(`/zones/${newZone.body.item.id}/deactivate`).expect(200);
    const { body } = await as('admin').post('/test-calculation', { ...(await exampleA()), zoneId: newZone.body.item.id }).expect(200);
    expect(body.result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' });
    await as('admin').delete(`/zones/${newZone.body.item.id}`).expect(204);
  });

  it('FR-PCF-07 the discount cap changes from 10% to 15%', async () => {
    const res = await as('admin').put('/discount-cap', { discountCapPercent: 15 }).expect(200);
    expect(res.body.data).toEqual({ currency: 'EUR', discountCapPercent: '15.00' });
    expect((await as('admin').get('/config').expect(200)).body.data.discountCapPercent).toBe('15.00');

    const entry = await latestAudit();
    expect(entry).toMatchObject({ entityType: 'PricingSettings', entityId: tenantId, action: 'UPDATE' });
    expect(entry.changes).toEqual([{ field: 'discountCapPercent', old: '10.00', new: '15.00' }]);
  });

  it('FR-AUD-09 every pricing write is one audit entry with its old and new values', async () => {
    const count = async () => auditCount();

    let before = await count();
    const zone = (await as('admin').post('/zones', { nameSq: 'Fier', nameEn: 'Fier', surchargePercent: '40' }).expect(201)).body.item;
    expect(await count()).toBe(before + 1);
    expect(await latestAudit()).toMatchObject({
      entityType: 'PriceZone',
      action: 'CREATE',
      changes: expect.arrayContaining([{ field: 'surchargePercent', old: null, new: '40.00' }]),
    });

    before = await count();
    await as('admin').patch(`/zones/${zone.id}`, { surchargePercent: '45.5' }).expect(200);
    expect(await count()).toBe(before + 1);
    expect((await latestAudit()).changes).toEqual([{ field: 'surchargePercent', old: '40.00', new: '45.50' }]);

    before = await count();
    await as('admin').patch(`/zones/${zone.id}`, { surchargePercent: '45.50' }).expect(200);
    expect(await count()).toBe(before);

    before = await count();
    await as('admin').post(`/zones/${zone.id}/deactivate`).expect(200);
    expect(await latestAudit()).toMatchObject({ action: 'STATUS_CHANGE', changes: [{ field: 'active', old: true, new: false }] });
    expect(await count()).toBe(before + 1);

    before = await count();
    await as('admin').delete(`/zones/${zone.id}`).expect(204);
    expect(await count()).toBe(before + 1);
    expect(await latestAudit()).toMatchObject({ entityType: 'PriceZone', action: 'DELETE', entityLabel: 'Fier' });

    const band = (await as('admin').post('/bands', { minEmployees: 51, maxEmployees: 60, baseFee: '300', perEmployeeFee: '5' }).expect(201))
      .body.item;
    before = await count();
    await as('admin').patch(`/bands/${band.id}`, { perEmployeeFee: '5.25' }).expect(200);
    expect(await latestAudit()).toMatchObject({
      entityType: 'EmployeeBand',
      entityLabel: '51–60',
      changes: [{ field: 'perEmployeeFee', old: '5.00', new: '5.25' }],
    });
    expect(await count()).toBe(before + 1);
    await as('admin').delete(`/bands/${band.id}`).expect(204);
  });

  it('FR-AUD-09 a failed audit write rolls the pricing change back', async () => {
    const failing = createApp({
      pricingWriteTransaction: new PrismaPricingWriteTransaction(prisma, () => ({
        record: async () => {
          throw new Error('audit down');
        },
      })),
    });
    await request(failing)
      .put(`/api/${slug}/pricing/discount-cap`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ discountCapPercent: '20' })
      .expect(500);
    expect((await as('admin').get('/config').expect(200)).body.data.discountCapPercent).toBe('15.00');
  });

  it('FR-PCF-01 a band cannot be reactivated over an active band covering the same employees', async () => {
    const band = (await as('admin').post('/bands', { minEmployees: 61, maxEmployees: 70, baseFee: '1', perEmployeeFee: '1' }).expect(201)).body
      .item;
    await as('admin').post(`/bands/${band.id}/deactivate`).expect(200);
    await as('admin').post('/bands', { minEmployees: 65, maxEmployees: 80, baseFee: '1', perEmployeeFee: '1' }).expect(201);
    expect((await as('admin').post(`/bands/${band.id}/reactivate`).expect(400)).body.code).toBe('BANDS_OVERLAP');
  });

  it('reorders the zones, and refuses an order that does not list every zone once', async () => {
    const config = (await as('admin').get('/config').expect(200)).body.data;
    const ids = config.zones.map((z: any) => z.id);
    const reversed = [...ids].reverse();
    const { body } = await as('admin').put('/zones/order', { ids: reversed }).expect(200);
    expect(body.data.map((z: any) => z.id)).toEqual(reversed);
    expect((await as('admin').put('/zones/order', { ids: ids.slice(1) }).expect(400)).body.code).toBe('INVALID_PRICING_ORDER');
    await as('admin').put('/zones/order', { ids }).expect(200);
    // Bands are always shown by employee range.
    await as('admin').put('/bands/order', { ids: [] }).expect(404);
  });

  it('NFR-SEC-04 Reception and Sales User may not read or change any pricing value', async () => {
    const medium = await riskLevelId(2);
    for (const who of ['reception', 'sales'] as const) {
      await as(who).get('/config').expect(403);
      await as(who).get('/cities-without-zone').expect(403);
      await as(who).post('/test-calculation', await exampleA()).expect(403);
      await as(who).put(`/risk-surcharges/${medium}`, { riskSurchargePercent: '50' }).expect(403);
      await as(who).put('/discount-cap', { discountCapPercent: '50' }).expect(403);
      await as(who).post('/bands', { minEmployees: 90, maxEmployees: 99, baseFee: '1', perEmployeeFee: '1' }).expect(403);
      await as(who).post('/nonsense', {}).expect(403);
    }
    const surcharge = await prisma.riskSurcharge.findFirstOrThrow({ where: { tenantId, riskLevelId: medium } });
    expect(surcharge.percent.toFixed(2)).toBe('10.00');
  });

  it('FR-RBAC-17 a role with pricing.manage but without commercial.view receives no amounts', async () => {
    const config = (await as('pricer').get('/config').expect(200)).body.data;
    expectNoCommercialFields(config);
    expect(config.bands[0]).toMatchObject({ minEmployees: 1, maxEmployees: 10 });

    const { body } = await as('pricer').post('/test-calculation', await exampleA()).expect(200);
    expectNoCommercialFields(body);
    expect(body.result).toEqual({ kind: 'PRICED' });
  });

  it('never reaches another workspace\'s zone or city', async () => {
    const otherTenantId = `t-pricing-other-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'Other', urlSlug: otherTenantId } });
    try {
      await new PrismaLookupSeeder(prisma).seed(otherTenantId);
      await new PrismaPricingSeeder(prisma).seed(otherTenantId);
      const otherZone = await prisma.priceZone.findFirstOrThrow({ where: { tenantId: otherTenantId } });
      const otherCity = await prisma.city.findFirstOrThrow({ where: { tenantId: otherTenantId } });

      await as('admin').patch(`/zones/${otherZone.id}`, { surchargePercent: '99' }).expect(404);
      await as('admin').put(`/zones/${otherZone.id}/cities`, { cityIds: [] }).expect(404);
      const centre = await zoneId('Tirana qendër');
      expect((await as('admin').put(`/zones/${centre}/cities`, { cityIds: [otherCity.id] }).expect(400)).body.code).toBe('CITY_NOT_ACTIVE');
      expect((await prisma.priceZone.findUniqueOrThrow({ where: { id: otherZone.id } })).surchargePercent.toFixed(2)).not.toBe('99.00');
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(otherTenantId);
    }
  });
});
