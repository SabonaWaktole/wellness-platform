import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { DEFAULT_FOLLOW_UP_INTERVALS, DEFAULT_LOST_REASONS } from '../../../src/lookups/domain/DefaultLookups';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 10 end to end (FR-SET-05, 06, 10; FR-AUD-02): the Administrator
 * manages follow-up intervals and lost-deal reasons, everyone in the
 * workspace reads the active values, and every write lands in the audit log.
 */
describe('Lookup lists: follow-up intervals and lost-deal reasons (FR-SET-05, 06)', () => {
  const tenantId = `t-sales-lists-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-sales-lists-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      patch: (path: string, body: object) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
    };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Sales lists tenant', urlSlug: slug } });
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
    await prisma.followUpInterval.deleteMany({ where: { tenantId } });
    await prisma.lostReason.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-SET-10 a new workspace starts with the 3/5/7-day intervals and the four lost-deal reasons', async () => {
    const intervals = await as('sales').get('/lookups/follow-up-intervals').expect(200);
    expect(intervals.body.data.map((i: any) => i.days)).toEqual(DEFAULT_FOLLOW_UP_INTERVALS.map((i) => i.days));

    const reasons = await as('sales').get('/lookups/lost-reasons').expect(200);
    expect(reasons.body.data.map((r: any) => r.nameSq)).toEqual(DEFAULT_LOST_REASONS.map((r) => r.nameSq));
  });

  it('FR-SET-05 a follow-up interval must be a whole number of days, unique in the workspace, and is audited', async () => {
    const invalid = await as('admin').post('/lookups/follow-up-intervals', { nameSq: '0 ditë', days: 0 }).expect(400);
    expect(invalid.body.code).toBe('INVALID_LOOKUP_VALUE');

    const clash = await as('admin').post('/lookups/follow-up-intervals', { nameSq: '5 ditë (2)', days: 5 }).expect(409);
    expect(clash.body.code).toBe('LOOKUP_VALUE_TAKEN');

    const created = await as('admin').post('/lookups/follow-up-intervals', { nameSq: '10 ditë', nameEn: '10 days', days: 10 }).expect(201);
    expect(created.body.item).toMatchObject({ days: 10, active: true });

    const log = await as('admin').get('/audit?entityType=FollowUpInterval&action=CREATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === created.body.item.id);
    expect(entry).toMatchObject({ userId: users.admin, entityLabel: '10 ditë' });
  });

  it('FR-SET-06 a lost-deal reason is labels only, and is audited on update', async () => {
    const created = await as('admin').post('/lookups/lost-reasons', { nameSq: 'Konkurrenca', nameEn: 'Competitor' }).expect(201);

    const updated = await as('admin')
      .patch(`/lookups/lost-reasons/${created.body.item.id}`, { nameSq: 'Konkurrenca e fortë' })
      .expect(200);
    expect(updated.body.item.nameSq).toBe('Konkurrenca e fortë');

    const log = await as('admin').get('/audit?entityType=LostReason&action=UPDATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === created.body.item.id);
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'nameSq', old: 'Konkurrenca', new: 'Konkurrenca e fortë' }]));
  });

  it('only settings.manage may write; a deactivated value is hidden from the active read', async () => {
    await as('sales').post('/lookups/follow-up-intervals', { nameSq: '14 ditë', days: 14 }).expect(403);
    await as('sales').post('/lookups/lost-reasons', { nameSq: 'Arsye' }).expect(403);

    const created = await as('admin').post('/lookups/lost-reasons', { nameSq: 'Për t’u fshehur' }).expect(201);
    await as('admin').post(`/lookups/lost-reasons/${created.body.item.id}/deactivate`).expect(200);

    const active = await as('sales').get('/lookups/lost-reasons').expect(200);
    expect(active.body.data.map((r: any) => r.id)).not.toContain(created.body.item.id);
  });
});
