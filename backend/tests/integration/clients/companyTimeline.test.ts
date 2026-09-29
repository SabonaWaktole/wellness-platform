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

const hasKeyDeep = (value: unknown, keys: string[]): boolean => {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, keys));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => keys.includes(k) || hasKeyDeep(v, keys));
  }
  return false;
};

/**
 * Slice 13 end to end (FR-CMP-05): one timeline per company, newest first,
 * of contacts, notes, activities, offers, contracts and payments —
 * filterable by type, paged by cursor, scoped and redacted per viewer.
 */
describe('Company timeline (Slice 13)', () => {
  const tenantId = `t-timeline-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-timeline-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    reception: uid('reception'),
  };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  let clientId: string;
  const quotationId = randomUUID();
  const contractId = randomUUID();

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Timeline tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);

    const businessTypeId = (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } })).id;
    const areaId = (await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } })).id;
    const cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;
    const profile = { businessTypeId, employeeCount: 4, areaId, cityId, taxId: `K${randomUUID().slice(0, 8)}` };

    const user = (id: string, roleKey: RoleKey, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId, firstName,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, RoleKey.Administrator, 'Ada'),
        user(users.salesA, RoleKey.SalesUser, 'Arben'),
        user(users.salesB, RoleKey.SalesUser, 'Besa'),
        user(users.reception, RoleKey.Reception, 'Rita'),
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    // The company, owned by Sales User A, with one contact removed again.
    const created = await as('admin').post('/clients', {
      customFieldValues: { Name: 'Timeline Co', Status: 'CLIENT' },
      profile,
      contacts: [
        { name: 'Keeper', position: 'Owner', phone: '+355691000001' },
        { name: 'Leaver', phone: '+355691000002' },
      ],
    });
    expect(created.status).toBe(201);
    clientId = created.body.id;
    await as('admin').put(`/clients/${clientId}`, { customFieldValues: { 'Assigned To': users.salesA }, profile });
    const leaver = created.body.contacts.find((c: any) => c.name === 'Leaver');
    expect((await as('admin').delete(`/clients/${clientId}/contacts/${leaver.id}`)).status).toBe(204);

    const at = (day: number) => new Date(Date.UTC(2026, 0, day, 9));
    await prisma.interaction.createMany({
      data: [
        { id: randomUUID(), tenantId, clientId, authorUserId: users.salesA, content: 'Left a note', channel: 'NOTE', createdAt: at(2) },
        { id: randomUUID(), tenantId, clientId, authorUserId: users.salesA, content: 'Called the owner', channel: 'CALL', createdAt: at(3) },
      ],
    });
    await prisma.appointment.create({
      data: { id: randomUUID(), tenantId, clientId, assignedUserId: users.salesA, scheduledAt: at(5), status: 'COMPLETED' },
    });
    await prisma.quotation.create({
      data: {
        id: quotationId, tenantId, clientId, createdByUserId: users.salesA, status: 'SENT', createdAt: at(6),
        statusHistory: {
          create: { tenantId, fromStatus: 'DRAFT', toStatus: 'SENT', changedByUserId: users.salesA, createdAt: at(7) },
        },
      },
    });
    await prisma.contract.create({
      data: {
        id: contractId, tenantId, clientId, assignedUserId: users.salesA, planName: 'Gold', status: 'ACTIVE',
        amount: 120, billingPeriod: 'MONTHLY', startsAt: at(8), endsAt: new Date(Date.UTC(2027, 0, 8)),
        createdByUserId: users.salesA, createdAt: at(8), activatedAt: at(9),
        statusHistory: {
          create: { id: randomUUID(), tenantId, fromStatus: 'DRAFT', toStatus: 'ACTIVE', changedByUserId: users.salesA, createdAt: at(9) },
        },
        payments: {
          create: {
            id: randomUUID(), tenantId, periodIndex: 1, dueDate: at(10), amount: 120, status: 'PAID',
            paidAmount: 120, paidAt: at(10), method: 'bank transfer',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.quotation.deleteMany({ where: { tenantId } });
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await prisma.interaction.deleteMany({ where: { tenantId } });
    await prisma.contactPerson.deleteMany({ where: { tenantId } });
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

  it('FR-CMP-05 returns every contact, note, activity, offer, contract and payment, newest first', async () => {
    const res = await as('admin').get(`/clients/${clientId}/history`);

    expect(res.status).toBe(200);
    const types = res.body.timeline.map((e: any) => e.type);
    expect(types.sort()).toEqual(
      [
        'APPOINTMENT_COMPLETED',
        'CONTACT_ADDED',
        'CONTACT_ADDED',
        'CONTACT_REMOVED',
        'CONTRACT_CREATED',
        'CONTRACT_STATUS_CHANGED',
        'INTERACTION_ADDED',
        'INTERACTION_ADDED',
        'PAYMENT_RECEIVED',
        'QUOTATION_CREATED',
        'QUOTATION_STATUS_CHANGED',
      ].sort()
    );
    const times = res.body.timeline.map((e: any) => Date.parse(e.timestamp));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.nextCursor).toBeNull();

    const contract = res.body.timeline.find((e: any) => e.type === 'CONTRACT_CREATED');
    expect(contract.details).toMatchObject({ contractId, planName: 'Gold', amount: 120 });
    expect(contract.actor).toEqual({ id: users.salesA, name: 'Arben' });
    const quotation = res.body.timeline.find((e: any) => e.type === 'QUOTATION_STATUS_CHANGED');
    expect(quotation.details).toMatchObject({ quotationId, fromStatus: 'DRAFT', toStatus: 'SENT' });
  });

  it('FR-CMP-05 filters by type', async () => {
    const res = await as('admin').get(`/clients/${clientId}/history?type=CONTRACT&type=PAYMENT`);

    expect(res.status).toBe(200);
    expect(res.body.timeline.map((e: any) => e.type)).toEqual([
      'PAYMENT_RECEIVED',
      'CONTRACT_STATUS_CHANGED',
      'CONTRACT_CREATED',
    ]);

    const commaSeparated = await as('admin').get(`/clients/${clientId}/history?type=NOTE,CONTACT`);
    expect(commaSeparated.body.timeline.map((e: any) => e.category).sort()).toEqual(
      ['CONTACT', 'CONTACT', 'CONTACT', 'NOTE'].sort()
    );
  });

  it('FR-CMP-05 pages through every entry exactly once with a cursor', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const query: string = cursor ? `limit=3&cursor=${encodeURIComponent(cursor)}` : 'limit=3';
      const res = await as('admin').get(`/clients/${clientId}/history?${query}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.timeline.map((e: any) => e.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(11);
    expect(new Set(seen).size).toBe(11);
  });

  it('FR-CMP-05 Reception sees contacts, notes and contract validity, with no amounts', async () => {
    const res = await as('reception').get(`/clients/${clientId}/history`);

    expect(res.status).toBe(200);
    const categories = new Set(res.body.timeline.map((e: any) => e.category));
    expect([...categories].sort()).toEqual(['CONTACT', 'CONTRACT', 'NOTE']);
    expect(hasKeyDeep(res.body, ['amount', 'total', 'paidAmount', 'paidAt'])).toBe(false);
    const contract = res.body.timeline.find((e: any) => e.type === 'CONTRACT_CREATED');
    expect(contract.details).toMatchObject({ planName: 'Gold' });
  });

  it('FR-CMP-05 the owning Sales User sees their company\'s whole timeline', async () => {
    const res = await as('salesA').get(`/clients/${clientId}/history`);

    expect(res.status).toBe(200);
    expect(res.body.timeline).toHaveLength(11);
  });

  it('FR-RBAC-11 another Sales User gets 404 for a company that is not theirs', async () => {
    const res = await as('salesB').get(`/clients/${clientId}/history`);

    expect(res.status).toBe(404);
  });

  it('rejects an unknown type or a malformed cursor with 400', async () => {
    const badType = await as('admin').get(`/clients/${clientId}/history?type=DEAL`);
    expect(badType.status).toBe(400);

    const badCursor = await as('admin').get(`/clients/${clientId}/history?cursor=nonsense`);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.code).toBe('TIMELINE_CURSOR_INVALID');
  });
});
