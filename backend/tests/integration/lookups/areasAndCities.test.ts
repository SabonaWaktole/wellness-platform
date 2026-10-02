import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { DEFAULT_AREAS } from '../../../src/lookups/domain/DefaultLookups';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 9 end to end (FR-SET-03, 04, 10; FR-AUD-02; UAT-3 step 2): the
 * Administrator manages areas and the cities in each, everyone in the
 * workspace reads the active values (optionally filtered by area), and every
 * write lands in the audit log.
 */
describe('Lookup lists: areas and cities (FR-SET-03, 04)', () => {
  const tenantId = `t-areas-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-areas-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  const areaId = async (nameSq: string) => (await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const cityId = async (nameSq: string, areaNameSq: string) =>
    (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq, area: { nameSq: areaNameSq } } })).id;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Areas tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const user = (id: string, roleKey: RoleKey) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [user(users.admin, RoleKey.Administrator), user(users.sales, RoleKey.SalesUser)],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.city.deleteMany({ where: { tenantId } });
    await prisma.area.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-SET-10 a new workspace starts with the 12 qarqe, each with a few cities', async () => {
    const areas = await as('sales').get('/lookups/areas').expect(200);
    expect(areas.body.data.map((a: any) => a.nameSq)).toEqual(DEFAULT_AREAS.map((a) => a.nameSq));

    const tirane = await as('sales').get(`/lookups/cities?areaId=${await areaId('Tiranë')}`).expect(200);
    expect(tirane.body.data.map((c: any) => c.nameSq)).toEqual(DEFAULT_AREAS.find((a) => a.nameSq === 'Tiranë')!.cities.map((c) => c.nameSq));
  });

  it('FR-SET-04 GET /lookups/cities?areaId= returns only that area\'s cities', async () => {
    const vlora = await areaId('Vlorë');
    const res = await as('sales').get(`/lookups/cities?areaId=${vlora}`).expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((c: any) => c.areaId === vlora)).toBe(true);
  });

  it('FR-SET-04 a city cannot be created under an unknown or inactive area', async () => {
    const created = await as('admin').post('/lookups/areas', { nameSq: 'Zonë provë' }).expect(201);
    await as('admin').post(`/lookups/areas/${created.body.item.id}/deactivate`).expect(200);

    const onInactive = await as('admin').post('/lookups/cities', { nameSq: 'Qytet', areaId: created.body.item.id }).expect(400);
    expect(onInactive.body.code).toBe('AREA_INACTIVE');
    const onUnknown = await as('admin').post('/lookups/cities', { nameSq: 'Qytet', areaId: 'nope' }).expect(400);
    expect(onUnknown.body.code).toBe('AREA_INACTIVE');
  });

  it('FR-SET-01 a new city shows up in the active list immediately, and is audited (UAT-3 step 2)', async () => {
    const vlora = await areaId('Vlorë');
    const created = await as('admin').post('/lookups/cities', { nameSq: 'Selenicë', nameEn: 'Selenicë', areaId: vlora }).expect(201);

    const cities = await as('sales').get(`/lookups/cities?areaId=${vlora}`).expect(200);
    expect(cities.body.data.map((c: any) => c.nameSq)).toContain('Selenicë');

    const log = await as('admin').get('/audit?entityType=City&action=CREATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === created.body.item.id);
    expect(entry).toMatchObject({ userId: users.admin, entityLabel: 'Selenicë' });
  });

  it('the same city name is refused within an area, but allowed in another', async () => {
    const vlora = await areaId('Vlorë');
    const tirane = await areaId('Tiranë');

    await as('admin').post('/lookups/cities', { nameSq: 'Sarandë', areaId: vlora }).expect(409);
    await as('admin').post('/lookups/cities', { nameSq: 'Sarandë', areaId: tirane }).expect(201);
  });

  it('FR-SET-04 an area with active cities cannot be deactivated without cascading; with cascade, its cities follow', async () => {
    const tirane = await areaId('Tiranë');

    const refused = await as('admin').post(`/lookups/areas/${tirane}/deactivate`).expect(409);
    expect(refused.body.code).toBe('AREA_HAS_ACTIVE_CITIES');
    expect(refused.body.activeCities).toBeGreaterThan(0);

    await as('admin').post(`/lookups/areas/${tirane}/deactivate`, { cascade: true }).expect(200);

    const cities = await prisma.city.findMany({ where: { tenantId, areaId: tirane } });
    expect(cities.every((c) => !c.active)).toBe(true);
    const statusEntries = await prisma.auditEntry.count({ where: { tenantId, entityType: 'City', action: 'STATUS_CHANGE' } });
    expect(statusEntries).toBe(cities.length);

    await as('admin').post(`/lookups/areas/${tirane}/reactivate`).expect(200);
    const stillInactive = await prisma.city.findMany({ where: { tenantId, areaId: tirane } });
    expect(stillInactive.every((c) => !c.active)).toBe(true);
  });

  it('only settings.manage may write; unknown lists are still 404', async () => {
    await as('sales').post('/lookups/areas', { nameSq: 'Zonë' }).expect(403);
    await as('sales').post('/lookups/cities', { nameSq: 'Qytet', areaId: await areaId('Fier') }).expect(403);
    await as('admin').get('/lookups/regions').expect(404);
  });

  it('reorders cities within one area without disturbing another area\'s order', async () => {
    const fier = await areaId('Fier');
    const before = await as('admin').get(`/lookups/cities?areaId=${fier}&includeInactive=true`).expect(200);
    const reversed = before.body.data.map((c: any) => c.id).reverse();

    const reordered = await as('admin').put(`/lookups/cities/order?areaId=${fier}`, { ids: reversed }).expect(200);
    expect(reordered.body.data.map((c: any) => c.id)).toEqual(reversed);

    // Cities outside the filtered area are untouched: reordering with a
    // wrong-sized list for this area's scope is refused.
    await as('admin').put(`/lookups/cities/order?areaId=${fier}`, { ids: [...reversed, 'not-in-this-area'] }).expect(400);
  });

  it('never lets a city point at another workspace\'s area', async () => {
    const otherTenantId = `t-areas-other-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'Other areas tenant', urlSlug: otherTenantId } });
    await new PrismaLookupSeeder(prisma).seed(otherTenantId);
    const foreignAreaId = (await prisma.area.findFirstOrThrow({ where: { tenantId: otherTenantId, nameSq: 'Fier' } })).id;

    const res = await as('admin').post('/lookups/cities', { nameSq: 'Qytet i ri', areaId: foreignAreaId }).expect(400);
    expect(res.body.code).toBe('AREA_INACTIVE');

    await prisma.city.deleteMany({ where: { tenantId: otherTenantId } });
    await prisma.area.deleteMany({ where: { tenantId: otherTenantId } });
    await prisma.tenant.deleteMany({ where: { id: otherTenantId } });
  });

  it('deleting an area that has cities is refused, like any value in use', async () => {
    const korce = await areaId('Korçë');

    const res = await as('admin').delete(`/lookups/areas/${korce}`).expect(409);
    expect(res.body.code).toBe('LOOKUP_ITEM_IN_USE');
  });

  it('FR-PCF-05 a city listed in a price zone is in use: it can be deactivated but not deleted', async () => {
    const shijak = await cityId('Shijak', 'Durrës');
    const zoneId = randomUUID();
    await prisma.priceZone.create({
      data: { id: zoneId, tenantId, nameSq: 'Zonë prove', surchargePercent: '5.00', cities: { create: [{ cityId: shijak }] } },
    });
    try {
      const res = await as('admin').delete(`/lookups/cities/${shijak}`).expect(409);
      expect(res.body.code).toBe('LOOKUP_ITEM_IN_USE');
      await as('admin').post(`/lookups/cities/${shijak}/deactivate`).expect(200);
    } finally {
      await prisma.priceZone.delete({ where: { id: zoneId } });
    }
  });
});
