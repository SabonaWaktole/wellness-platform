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
 * Slice 12 end to end (FR-CMP-04, FR-CMP-06 contact search, NFR-SEC-03;
 * UAT-2 contacts, UAT-1 step 4): a company always has at least one contact,
 * exactly one is primary, and Reception can find a company by a contact's
 * phone without seeing commercial fields.
 */
describe('Contact persons (Slice 12)', () => {
  const tenantId = `t-contacts-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-contacts-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), salesA: uid('salesA'), salesB: uid('salesB'), reception: uid('reception') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object = {}) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  let businessTypeId: string;
  let areaId: string;
  let cityId: string;

  const validProfile = () => ({
    businessTypeId, employeeCount: 4, areaId, cityId, taxId: `K${randomUUID().slice(0, 8)}`,
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Contacts tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const cafe = await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } });
    businessTypeId = cafe.id;
    const tirana = await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } });
    areaId = tirana.id;
    cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;

    const user = (id: string, roleKey: RoleKey) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, RoleKey.Administrator),
        user(users.salesA, RoleKey.SalesUser),
        user(users.salesB, RoleKey.SalesUser),
        user(users.reception, RoleKey.Reception),
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await prisma.contactPerson.deleteMany({ where: { tenantId } });
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

  const createCompany = (contacts: object[], name = `Acme ${randomUUID().slice(0, 8)}`) =>
    as('admin').post('/clients', {
      customFieldValues: { Name: name, Status: 'PROSPECT' },
      profile: validProfile(),
      contacts,
    });

  it('FR-CMP-04 a company cannot be created with zero contacts', async () => {
    const res = await as('admin').post('/clients', {
      customFieldValues: { Name: 'No Contact Ltd', Status: 'PROSPECT' },
      profile: validProfile(),
      contacts: [],
    });
    expect(res.status).toBe(400);
  });

  it('FR-CMP-04 creates a company with two contacts; the first becomes primary', async () => {
    const res = await createCompany([
      { name: 'Jane Doe', position: 'Manager', phone: '+355691234567', email: 'jane@example.com' },
      { name: 'John Roe', phone: '+355691234568' },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.contacts).toHaveLength(2);
    expect(res.body.contacts.filter((c: any) => c.isPrimary)).toHaveLength(1);
    expect(res.body.contacts.find((c: any) => c.name === 'Jane Doe').isPrimary).toBe(true);
  });

  it('a contact with no phone and no email is rejected', async () => {
    const res = await createCompany([{ name: 'No Reach' }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CONTACT_REACH_REQUIRED');
  });

  describe('add / edit / remove / set primary', () => {
    let clientId: string;
    let firstContactId: string;

    beforeAll(async () => {
      const created = await createCompany([{ name: 'Primary One', phone: '+355691111111' }]);
      clientId = created.body.id;
      firstContactId = created.body.contacts[0].id;
    });

    it('adds a second contact, which is not primary', async () => {
      const res = await as('admin').post(`/clients/${clientId}/contacts`, {
        name: 'Second Contact', phone: '+355692222222',
      });
      expect(res.status).toBe(201);
      expect(res.body.isPrimary).toBe(false);
    });

    it('edits a contact with a partial patch', async () => {
      const res = await as('admin').patch(`/clients/${clientId}/contacts/${firstContactId}`, {
        position: 'CEO',
      });
      expect(res.status).toBe(200);
      expect(res.body.position).toBe('CEO');
      expect(res.body.phone).toBe('+355691111111');
    });

    it('refuses to remove the primary contact without naming a replacement', async () => {
      const res = await as('admin').delete(`/clients/${clientId}/contacts/${firstContactId}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRIMARY_CONTACT_REQUIRED');
    });

    it('sets a new primary contact, moving the flag off the old one', async () => {
      const list = await as('admin').get(`/clients/${clientId}`);
      const second = list.body.contacts.find((c: any) => c.id !== firstContactId);

      const res = await as('admin').post(`/clients/${clientId}/contacts/${second.id}/primary`);
      expect(res.status).toBe(204);

      const after = await as('admin').get(`/clients/${clientId}`);
      expect(after.body.contacts.find((c: any) => c.id === second.id).isPrimary).toBe(true);
      expect(after.body.contacts.find((c: any) => c.id === firstContactId).isPrimary).toBe(false);
    });

    it('removes a non-primary contact outright', async () => {
      const before = await as('admin').get(`/clients/${clientId}`);
      const nonPrimary = before.body.contacts.find((c: any) => !c.isPrimary);

      const res = await as('admin').delete(`/clients/${clientId}/contacts/${nonPrimary.id}`);
      expect(res.status).toBe(204);

      const after = await as('admin').get(`/clients/${clientId}`);
      expect(after.body.contacts.map((c: any) => c.id)).not.toContain(nonPrimary.id);
    });

    it('refuses to remove the last remaining contact', async () => {
      const before = await as('admin').get(`/clients/${clientId}`);
      expect(before.body.contacts).toHaveLength(1);
      const last = before.body.contacts[0];

      const res = await as('admin').delete(`/clients/${clientId}/contacts/${last.id}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRIMARY_CONTACT_REQUIRED');
    });
  });

  it('a Sales User cannot touch another salesperson\'s company contacts (404)', async () => {
    const created = await createCompany([{ name: 'Owned By A', phone: '+355693333333' }]);
    await as('admin').put(`/clients/${created.body.id}`, {
      customFieldValues: { 'Assigned To': users.salesA },
      profile: validProfile(),
    });

    const res = await as('salesB').post(`/clients/${created.body.id}/contacts`, {
      name: 'Intruder', phone: '+355694444444',
    });
    expect(res.status).toBe(404);
  });

  it('UAT-1 step 4: Reception finds a company by a contact\'s phone, sees contacts, and cannot write them', async () => {
    const phone = `+3556955${Math.floor(10000 + Math.random() * 89999)}`;
    const created = await createCompany([{ name: 'Findable Contact', phone }], 'Findable Co');
    expect(created.status).toBe(201);

    const found = await as('reception').get(`/clients/search?search=${encodeURIComponent(phone)}`);
    expect(found.status).toBe(200);
    expect(found.body.items.map((c: any) => c.id)).toContain(created.body.id);

    const detail = await as('reception').get(`/clients/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.contacts).toHaveLength(1);

    const write = await as('reception').post(`/clients/${created.body.id}/contacts`, {
      name: 'Blocked', phone: '+355699999999',
    });
    expect(write.status).toBe(403);
  });

  it('NFR-SEC-03 a removed contact is left out of reads and out of search', async () => {
    const phone = `+3556966${Math.floor(10000 + Math.random() * 89999)}`;
    const created = await createCompany([
      { name: 'Keeper', phone: '+355697777777' },
      { name: 'Removable', phone },
    ], 'Soft Delete Co');
    const removable = created.body.contacts.find((c: any) => c.name === 'Removable');

    const removed = await as('admin').delete(`/clients/${created.body.id}/contacts/${removable.id}`);
    expect(removed.status).toBe(204);

    const detail = await as('admin').get(`/clients/${created.body.id}`);
    expect(detail.body.contacts.map((c: any) => c.id)).not.toContain(removable.id);

    const search = await as('admin').get(`/clients/search?search=${encodeURIComponent(phone)}`);
    expect(search.body.items.map((c: any) => c.id)).not.toContain(created.body.id);
  });
});
