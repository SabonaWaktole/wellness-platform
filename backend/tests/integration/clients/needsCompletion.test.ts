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
 * Slice 14 (FR-CMP-08): `?needsCompletion=true` narrows the company list to
 * whatever the legacy migration's report would still flag — missing a
 * profile field or a contact — combined with the viewer's scope.
 */
describe('Company list needsCompletion filter (FR-CMP-08)', () => {
  const tenantId = `t-needscompl-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-needscompl-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('sales-a'), salesB: uid('sales-b') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => ({
    get: (path: string) => request(app).get(`/api/${slug}${path}`).set('Authorization', `Bearer ${tokens[who]}`),
  });

  let complete: string;
  let missingContact: string;
  let missingProfile: string;
  let ofSalesB: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'NeedsCompletion tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const businessTypeId = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } })).id;
    const areaId = (await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })).id;
    const cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;

    await prisma.user.createMany({
      data: [
        { id: users.admin, email: `${users.admin}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Administrator], tenantId, firstName: 'Ada' },
        { id: users.salesA, email: `${users.salesA}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesUser], tenantId, firstName: 'Arben' },
        { id: users.salesB, email: `${users.salesB}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesUser], tenantId, firstName: 'Besa' },
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    const baseClient = (id: string, overrides: Record<string, unknown>) => ({
      id,
      tenantId,
      name: id,
      lastUpdatedByUserId: users.admin,
      customFieldValues: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedUserId: users.salesA,
      ...overrides,
    });

    complete = randomUUID();
    await prisma.client.create({ data: baseClient(complete, { businessTypeId, employeeCount: 5, areaId, cityId }) });
    await prisma.contactPerson.create({
      data: { id: randomUUID(), tenantId, clientId: complete, name: 'Owner', isPrimary: true, createdAt: new Date(), updatedAt: new Date() },
    });

    missingContact = randomUUID();
    await prisma.client.create({ data: baseClient(missingContact, { businessTypeId, employeeCount: 5, areaId, cityId }) });

    missingProfile = randomUUID();
    await prisma.client.create({ data: baseClient(missingProfile, {}) });
    await prisma.contactPerson.create({
      data: { id: randomUUID(), tenantId, clientId: missingProfile, name: 'Owner', isPrimary: true, createdAt: new Date(), updatedAt: new Date() },
    });

    ofSalesB = randomUUID();
    await prisma.client.create({ data: baseClient(ofSalesB, { assignedUserId: users.salesB }) });
  });

  afterAll(async () => {
    await prisma.contactPerson.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.businessType.deleteMany({ where: { tenantId } });
    await prisma.riskLevel.deleteMany({ where: { tenantId } });
    await prisma.city.deleteMany({ where: { tenantId } });
    await prisma.area.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-CMP-08 lists only incomplete companies, across the whole tenant for an Administrator', async () => {
    const res = await as('admin').get('/clients/search?needsCompletion=true');
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids).toEqual(expect.arrayContaining([missingContact, missingProfile, ofSalesB]));
    expect(ids).not.toContain(complete);
    expect(res.body.total).toBe(3);
  });

  it('does not filter out complete companies when needsCompletion is not set', async () => {
    const res = await as('admin').get('/clients/search');
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids).toContain(complete);
  });

  it('FR-RBAC-11..13 combines with the viewer scope: Sales User A does not see Sales User B\'s incomplete company', async () => {
    const res = await as('salesA').get('/clients/search?needsCompletion=true');
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids).toEqual(expect.arrayContaining([missingContact, missingProfile]));
    expect(ids).not.toContain(ofSalesB);
    expect(res.body.total).toBe(2);
  });
});
