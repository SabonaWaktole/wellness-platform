import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 10 end to end (FR-SET-09, FR-AUD-02): the Administrator edits the
 * workspace's general settings, and every change lands in the audit log.
 */
describe('Workspace settings (FR-SET-09)', () => {
  const tenantId = `t-workspace-settings-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-workspace-settings-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
    };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Workspace settings tenant', urlSlug: slug, dateFormat: 'DD.MM.YYYY' } });
    const roles = await seedSystemRoles(prisma, tenantId);

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
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-SET-09 changing the date format applies immediately and is audited as one Workspace entry', async () => {
    const updated = await as('admin').put('/settings', { dateFormat: 'MM/DD/YYYY' }).expect(200);
    expect(updated.body.dateFormat).toBe('MM/DD/YYYY');

    const read = await as('sales').get('/settings').expect(200);
    expect(read.body.dateFormat).toBe('MM/DD/YYYY');

    const log = await as('admin').get('/audit?entityType=Workspace&action=UPDATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === tenantId);
    expect(entry).toMatchObject({ userId: users.admin });
  });

  it('a request that changes nothing writes no audit entry', async () => {
    const before = await prisma.auditEntry.count({ where: { tenantId, entityType: 'Workspace' } });

    await as('admin').put('/settings', { dateFormat: 'MM/DD/YYYY' }).expect(200);

    const after = await prisma.auditEntry.count({ where: { tenantId, entityType: 'Workspace' } });
    expect(after).toBe(before);
  });

  it('only settings.manage may write; reads stay open', async () => {
    await as('sales').put('/settings', { name: 'Hijacked' }).expect(403);
    await as('sales').get('/settings').expect(200);
  });
});
