import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaLookupWriteTransaction } from '../../../src/lookups/infrastructure/PrismaLookupWriteTransaction';
import { DEFAULT_BUSINESS_TYPES, DEFAULT_RISK_LEVELS } from '../../../src/lookups/domain/DefaultLookups';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 8 end to end (FR-SET-01, 02, 10; FR-AUD-02; UAT-3 step 1): the
 * Administrator manages risk levels and business types, everyone in the
 * workspace reads the active values, and every write lands in the audit log.
 */
describe('Lookup lists: risk levels and business types (FR-SET-01, 02)', () => {
  const tenantId = `t-lookups-${randomUUID()}`;
  const otherTenantId = `t-lookups-other-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-lookups-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales'), reception: uid('reception') };
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

  const riskLevelId = async (level: number, tenant = tenantId) =>
    (await prisma.riskLevel.findFirstOrThrow({ where: { tenantId: tenant, level } })).id;
  const businessTypeId = async (nameSq: string, tenant = tenantId) =>
    (await prisma.businessType.findFirstOrThrow({ where: { tenantId: tenant, nameSq } })).id;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Lookups tenant', urlSlug: slug },
        { id: otherTenantId, name: 'Other lookups tenant', urlSlug: otherTenantId },
      ],
    });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaLookupSeeder(prisma).seed(otherTenantId);

    const user = (id: string, roleKey: RoleKey) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [user(users.admin, RoleKey.Administrator), user(users.sales, RoleKey.SalesUser), user(users.reception, RoleKey.Reception)],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.businessType.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.riskLevel.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('FR-SET-10 a new workspace starts with the placeholder lists, each type on its risk level', async () => {
    const levels = await as('sales').get('/lookups/risk-levels').expect(200);
    expect(levels.body.data.map((l: any) => l.level)).toEqual(DEFAULT_RISK_LEVELS.map((l) => l.level));

    const types = await as('sales').get('/lookups/business-types').expect(200);
    expect(types.body.data.map((t: any) => t.nameSq)).toEqual(DEFAULT_BUSINESS_TYPES.map((t) => t.nameSq));
    const factory = types.body.data.find((t: any) => t.nameSq === 'Fabrikë');
    expect(factory.riskLevelId).toBe(await riskLevelId(3));
  });

  it('FR-SET-01 only settings.manage may write; unknown lists are 404', async () => {
    const body = { nameSq: 'Bar', riskLevelId: await riskLevelId(1) };
    await as('sales').post('/lookups/business-types', body).expect(403);
    await as('reception').post('/lookups/business-types', body).expect(403);
    await as('admin').get('/lookups/colours').expect(404);
    await as('admin').post('/lookups/colours', body).expect(404);
  });

  it('FR-SET-01 a new business type shows up in the active list immediately, and is audited', async () => {
    const created = await as('admin')
      .post('/lookups/business-types', { nameSq: 'Klinikë', nameEn: 'Clinic', riskLevelId: await riskLevelId(2) })
      .expect(201);

    const types = await as('reception').get('/lookups/business-types').expect(200);
    expect(types.body.data.map((t: any) => t.nameSq)).toContain('Klinikë');
    const entry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'BusinessType', entityId: created.body.item.id } });
    expect(entry).toMatchObject({ action: 'CREATE', userId: users.admin, entityLabel: 'Klinikë' });
  });

  it('UAT-3 step 1: changing a business type\'s risk level appears in the audit log', async () => {
    const cafe = await businessTypeId('Kafene');

    await as('admin').patch(`/lookups/business-types/${cafe}`, { riskLevelId: await riskLevelId(2) }).expect(200);

    const log = await as('admin').get('/audit?entityType=BusinessType&action=UPDATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === cafe);
    expect(entry).toBeDefined();
    const detail = await as('admin').get(`/audit/${entry.id}`).expect(200);
    expect(JSON.stringify(detail.body)).toContain('Niveli 1');
    expect(JSON.stringify(detail.body)).toContain('Niveli 2');
  });

  it('rejects an invalid body, a blank name and a duplicate name', async () => {
    await as('admin').post('/lookups/risk-levels', { nameSq: 'Niveli X', level: 'high' }).expect(400);
    const blank = await as('admin').post('/lookups/risk-levels', { nameSq: '  ', level: 7 }).expect(400);
    expect(blank.body).toMatchObject({ code: 'INVALID_LOOKUP_VALUE', field: 'nameSq' });
    const taken = await as('admin').post('/lookups/risk-levels', { nameSq: 'Niveli i ri', level: 1 }).expect(409);
    expect(taken.body).toMatchObject({ code: 'LOOKUP_VALUE_TAKEN', field: 'level' });
    await as('admin').post('/lookups/business-types', { nameSq: 'hotel', riskLevelId: await riskLevelId(1) }).expect(409);
  });

  it('FR-SET-01 a deactivated value leaves the active list; the Administrator can still see it', async () => {
    const hotel = await businessTypeId('Hotel');

    await as('admin').post(`/lookups/business-types/${hotel}/deactivate`).expect(200);

    const forSales = await as('sales').get('/lookups/business-types?includeInactive=true').expect(200);
    expect(forSales.body.data.map((t: any) => t.id)).not.toContain(hotel);
    const forAdmin = await as('admin').get('/lookups/business-types?includeInactive=true').expect(200);
    expect(forAdmin.body.data.find((t: any) => t.id === hotel)).toMatchObject({ active: false });

    await as('admin').post(`/lookups/business-types/${hotel}/reactivate`).expect(200);
    const statusEntries = await prisma.auditEntry.count({ where: { tenantId, entityId: hotel, action: 'STATUS_CHANGE' } });
    expect(statusEntries).toBe(2);
  });

  it('FR-SET-02 a risk level used by active business types can be neither deactivated nor deleted', async () => {
    const level3 = await riskLevelId(3);

    const deactivate = await as('admin').post(`/lookups/risk-levels/${level3}/deactivate`).expect(409);
    expect(deactivate.body.code).toBe('RISK_LEVEL_STILL_USED');
    const remove = await as('admin').delete(`/lookups/risk-levels/${level3}`).expect(409);
    expect(remove.body.code).toBe('LOOKUP_ITEM_IN_USE');
  });

  it('refuses a business type on an inactive risk level', async () => {
    const created = await as('admin').post('/lookups/risk-levels', { nameSq: 'Niveli 4', level: 4 }).expect(201);
    await as('admin').post(`/lookups/risk-levels/${created.body.item.id}/deactivate`).expect(200);

    const res = await as('admin').post('/lookups/business-types', { nameSq: 'Minierë', riskLevelId: created.body.item.id }).expect(400);
    expect(res.body.code).toBe('RISK_LEVEL_INACTIVE');
  });

  it('reorders a list and deletes an unused value, both audited', async () => {
    const all = await as('admin').get('/lookups/risk-levels?includeInactive=true').expect(200);
    const reversed = all.body.data.map((l: any) => l.id).reverse();

    const reordered = await as('admin').put('/lookups/risk-levels/order', { ids: reversed }).expect(200);
    expect(reordered.body.data.map((l: any) => l.id)).toEqual(reversed);
    await as('admin').put('/lookups/risk-levels/order', { ids: reversed.slice(1) }).expect(400);

    const level4 = await riskLevelId(4);
    await as('admin').delete(`/lookups/risk-levels/${level4}`).expect(204);
    expect(await prisma.riskLevel.count({ where: { id: level4 } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { tenantId, entityId: level4, action: 'DELETE' } })).toBe(1);
  });

  it('never reaches another workspace\'s values', async () => {
    const foreign = await businessTypeId('Zyrë', otherTenantId);

    await as('admin').patch(`/lookups/business-types/${foreign}`, { nameSq: 'Hijacked' }).expect(404);
    await as('admin').delete(`/lookups/business-types/${foreign}`).expect(404);
    const moved = await as('admin')
      .patch(`/lookups/business-types/${await businessTypeId('Zyrë')}`, { riskLevelId: await riskLevelId(1, otherTenantId) })
      .expect(400);
    expect(moved.body.code).toBe('RISK_LEVEL_INACTIVE');
    expect(await prisma.businessType.findUniqueOrThrow({ where: { id: foreign } })).toMatchObject({ nameSq: 'Zyrë' });
  });

  it('FR-AUD-04 a failed audit write rolls the list change back', async () => {
    const failing = createApp({
      lookupWriteTransaction: new PrismaLookupWriteTransaction(prisma, () => ({
        record: async () => {
          throw new Error('audit down');
        },
      })),
    });

    await request(failing)
      .post(`/api/${slug}/lookups/business-types`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ nameSq: 'Farmaci', riskLevelId: await riskLevelId(1) })
      .expect(500);
    expect(await prisma.businessType.count({ where: { tenantId, nameSq: 'Farmaci' } })).toBe(0);
  });
});
