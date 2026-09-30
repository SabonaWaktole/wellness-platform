import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 11 end to end (FR-CMP-01, 02, 03, 06, 07, 09; FR-AUD-02; UAT-2): a
 * company carries a business type, employees, area/city and NIPT; its risk
 * level always follows the business type; the list can be filtered by every
 * new field; and reassigning or archiving a company is audited.
 */
describe('Company record (Slice 11)', () => {
  const tenantId = `t-company-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-company-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  let businessTypeCafe: string;
  let businessTypeFactory: string; // higher risk level
  let riskLevel1: string;
  let riskLevel3: string;
  let areaTirana: string;
  let areaVlora: string;
  let cityTirana: string;
  let cityVlora: string;

  const validProfile = () => ({
    businessTypeId: businessTypeCafe,
    employeeCount: 8,
    areaId: areaTirana,
    cityId: cityTirana,
    streetAddress: 'Rr. Dëshmorët e Kombit',
    taxId: `K${randomUUID().slice(0, 8)}`,
    website: 'https://acme.al',
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Company tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const cafe = await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } });
    const factory = await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Fabrikë' } });
    businessTypeCafe = cafe.id;
    businessTypeFactory = factory.id;
    riskLevel1 = cafe.riskLevelId;
    riskLevel3 = factory.riskLevelId;

    const tirana = await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } });
    const vlora = await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Vlorë' } });
    areaTirana = tirana.id;
    areaVlora = vlora.id;
    cityTirana = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId: areaTirana, nameSq: 'Tiranë' } })).id;
    cityVlora = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId: areaVlora, nameSq: 'Vlorë' } })).id;

    const user = (id: string, roleKey: RoleKey) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, RoleKey.Administrator),
        user(users.salesA, RoleKey.SalesUser),
        user(users.salesB, RoleKey.SalesUser),
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.customFieldDefinition.deleteMany({ where: { tenantId } });
    await prisma.businessType.deleteMany({ where: { tenantId } });
    await prisma.riskLevel.deleteMany({ where: { tenantId } });
    await prisma.city.deleteMany({ where: { tenantId } });
    await prisma.area.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const defaultContacts = () => [{ name: 'Jane Doe', phone: '+355691234567' }];

  const createCompany = (overrides: Partial<ReturnType<typeof validProfile>> = {}, name = `Acme ${randomUUID().slice(0, 8)}`) =>
    as('admin').post('/clients', {
      customFieldValues: { Name: name, Status: 'PROSPECT' },
      profile: { ...validProfile(), ...overrides },
      contacts: defaultContacts(),
    });

  it('FR-CMP-01, 02, 03 creates a company with every required field, and derives its risk from the business type', async () => {
    const res = await createCompany();
    expect(res.status).toBe(201);
    expect(res.body.profile.businessType.id).toBe(businessTypeCafe);
    expect(res.body.profile.riskLevel.id).toBe(riskLevel1);
    expect(res.body.profile.area.id).toBe(areaTirana);
    expect(res.body.profile.city.id).toBe(cityTirana);
    expect(res.body.profile.employeeCount).toBe(8);
  });

  it('FR-CMP-07 changing the business type changes the derived risk, without a client write', async () => {
    const created = await createCompany();
    const clientId = created.body.id;

    const updated = await as('admin').put(`/clients/${clientId}`, {
      profile: { ...validProfile(), businessTypeId: businessTypeFactory },
    });

    expect(updated.status).toBe(200);
    expect(updated.body.profile.businessType.id).toBe(businessTypeFactory);
    expect(updated.body.profile.riskLevel.id).toBe(riskLevel3);
  });

  it('a required field missing from the profile is rejected with a coded error', async () => {
    // Passes the schema (a non-empty string) but matches no area of this
    // tenant, so the domain layer is what actually catches it.
    const res = await as('admin').post('/clients', {
      customFieldValues: { Name: 'No Area Ltd', Status: 'PROSPECT' },
      profile: { businessTypeId: businessTypeCafe, employeeCount: 3, areaId: 'no-such-area', cityId: cityTirana },
      contacts: defaultContacts(),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AREA_REQUIRED');
  });

  it('a city from another area is rejected (CITY_NOT_IN_AREA)', async () => {
    const res = await as('admin').post('/clients', {
      customFieldValues: { Name: 'Mismatch Ltd', Status: 'PROSPECT' },
      profile: { businessTypeId: businessTypeCafe, employeeCount: 3, areaId: areaTirana, cityId: cityVlora },
      contacts: defaultContacts(),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CITY_NOT_IN_AREA');
  });

  it('FR-CMP-02 a duplicate company name is a warning, not an error', async () => {
    const name = `Duplicate Co ${randomUUID().slice(0, 8)}`;
    const first = await createCompany({}, name);
    expect(first.status).toBe(201);
    expect(first.body.warnings).toEqual([]);

    const second = await createCompany({}, name);
    expect(second.status).toBe(201);
    expect(second.body.warnings).toContain('DUPLICATE_NAME');
  });

  it('Q8 a duplicate NIPT is rejected (TAX_ID_TAKEN)', async () => {
    const taxId = `K${randomUUID().slice(0, 8)}`;
    const first = await createCompany({ taxId });
    expect(first.status).toBe(201);

    const second = await createCompany({ taxId });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('TAX_ID_TAKEN');
  });

  it('FR-CMP-06 filters the list by business type, risk level, area and city', async () => {
    const cafeCo = await createCompany({ businessTypeId: businessTypeCafe, areaId: areaTirana, cityId: cityTirana });
    const factoryCo = await createCompany({ businessTypeId: businessTypeFactory, areaId: areaVlora, cityId: cityVlora });

    const byBusinessType = await as('admin').get(`/clients/search?businessTypeId=${businessTypeCafe}`);
    const btIds = byBusinessType.body.items.map((c: any) => c.id);
    expect(btIds).toContain(cafeCo.body.id);
    expect(btIds).not.toContain(factoryCo.body.id);

    const byRisk = await as('admin').get(`/clients/search?riskLevelId=${riskLevel3}`);
    const riskIds = byRisk.body.items.map((c: any) => c.id);
    expect(riskIds).toContain(factoryCo.body.id);
    expect(riskIds).not.toContain(cafeCo.body.id);

    const byArea = await as('admin').get(`/clients/search?areaId=${areaVlora}`);
    expect(byArea.body.items.map((c: any) => c.id)).toContain(factoryCo.body.id);

    const byCity = await as('admin').get(`/clients/search?cityId=${cityTirana}`);
    expect(byCity.body.items.map((c: any) => c.id)).toContain(cafeCo.body.id);
  });

  it('search filters respect scope: a Sales User sees only their own companies', async () => {
    const ownA = await createCompany();
    await as('admin').put(`/clients/${ownA.body.id}`, { profile: validProfile() });
    // Reassign ownA to salesA via an edit that also names the assignee.
    const assigned = await as('admin').put(`/clients/${ownA.body.id}`, {
      customFieldValues: { 'Assigned To': users.salesA },
      profile: validProfile(),
    });
    expect(assigned.status).toBe(200);

    const salesAView = await as('salesA').get(`/clients/search?businessTypeId=${businessTypeCafe}`);
    expect(salesAView.body.items.map((c: any) => c.id)).toContain(ownA.body.id);

    const salesBView = await as('salesB').get(`/clients/search?businessTypeId=${businessTypeCafe}`);
    expect(salesBView.body.items.map((c: any) => c.id)).not.toContain(ownA.body.id);
  });

  it('FR-AUD-02 reassigning without companies.reassign is refused, and with it is audited', async () => {
    const created = await createCompany();
    const clientId = created.body.id;

    // Give it to salesA first, so the next attempt is a Sales User editing
    // their OWN company (companies.edit: Own) but still lacking
    // companies.reassign — the permission actually under test, not merely
    // companies.edit.
    await as('admin').put(`/clients/${clientId}`, {
      customFieldValues: { 'Assigned To': users.salesA },
      profile: validProfile(),
    });

    const refused = await as('salesA').put(`/clients/${clientId}`, {
      customFieldValues: { 'Assigned To': users.salesB },
      profile: validProfile(),
    });
    expect(refused.status).toBe(403);

    const reassigned = await as('admin').put(`/clients/${clientId}`, {
      customFieldValues: { 'Assigned To': users.salesB },
      profile: validProfile(),
    });
    expect(reassigned.status).toBe(200);

    const log = await as('admin').get(`/audit?entityType=Client&action=UPDATE`);
    expect(log.status).toBe(200);
    expect(log.body.data.some((e: any) => e.entityId === clientId)).toBe(true);
  });

  it('FR-CMP-09, FR-AUD-02 deleting a company is an audited soft delete, refused without companies.delete', async () => {
    const created = await createCompany();
    const clientId = created.body.id;

    const refused = await as('salesA').delete(`/clients/${clientId}`);
    expect(refused.status).toBe(403);

    const archived = await as('admin').delete(`/clients/${clientId}`);
    expect(archived.status).toBe(200);

    const row = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(row.deletedAt).not.toBeNull();
    const active = await as('admin').get(`/clients/search?take=100`);
    expect(active.body.items.map((c: any) => c.id)).not.toContain(clientId);

    const log = await as('admin').get(`/audit?entityType=Client&action=DELETE`);
    expect(log.status).toBe(200);
    expect(log.body.data.some((e: any) => e.entityId === clientId)).toBe(true);
  });
});
