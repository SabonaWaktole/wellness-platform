import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { catalogueKeys, StatusDomain } from '../../../src/statuses/domain/StatusCatalogue';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 10 end to end (FR-SET-07, 08): the Administrator renames, recolours
 * and reorders contract and payment statuses, everyone in the workspace
 * reads the result, and every write lands in the audit log.
 */
describe('Status labels (FR-SET-07, 08)', () => {
  const tenantId = `t-statuses-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-statuses-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      patch: (path: string, body: object) => auth(request(app).patch(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
    };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Statuses tenant', urlSlug: slug } });
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
    await prisma.statusLabel.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-SET-07 the contract statuses start at the catalogue defaults, in the fixed order', async () => {
    const res = await as('sales').get('/status-labels/contract').expect(200);
    expect(res.body.data.map((l: any) => l.key)).toEqual(catalogueKeys(StatusDomain.Contract));
  });

  it('FR-SET-07 renaming "Active" changes the label everywhere; the key stays ACTIVE, and it is audited', async () => {
    const updated = await as('admin')
      .patch('/status-labels/contract/ACTIVE', { labelSq: 'Në fuqi', labelEn: 'Live', colour: '#00ff00' })
      .expect(200);
    expect(updated.body.item).toMatchObject({ key: 'ACTIVE', labelSq: 'Në fuqi', labelEn: 'Live' });

    const list = await as('sales').get('/status-labels/contract').expect(200);
    expect(list.body.data.find((l: any) => l.key === 'ACTIVE')).toMatchObject({ labelSq: 'Në fuqi' });

    const log = await as('admin').get('/audit?entityType=StatusLabel&action=UPDATE').expect(200);
    const entry = log.body.data.find((e: any) => e.entityId === 'CONTRACT:ACTIVE');
    expect(entry).toMatchObject({ userId: users.admin });
  });

  it('FR-SET-08 updating the legacy WAIVED key is refused; it is not in the payment catalogue', async () => {
    const res = await as('admin').patch('/status-labels/payment/WAIVED', { labelSq: 'X', colour: '#000000' }).expect(404);
    expect(res.body.code).toBe('STATUS_KEY_NOT_FOUND');
  });

  it('only settings.manage may write; reads stay open', async () => {
    await as('sales').patch('/status-labels/contract/DRAFT', { labelSq: 'X', colour: '#000000' }).expect(403);
    await as('sales').get('/status-labels/payment').expect(200);
  });

  it('reorders a domain\'s statuses and rejects a partial or foreign key list', async () => {
    const keys = catalogueKeys(StatusDomain.Payment);
    const reversed = [...keys].reverse();

    const reordered = await as('admin').put('/status-labels/payment/order', { keys: reversed }).expect(200);
    expect(reordered.body.data.map((l: any) => l.key)).toEqual(reversed);

    await as('admin').put('/status-labels/payment/order', { keys: keys.slice(1) }).expect(400);
  });

  it('an unknown domain is 404', async () => {
    await as('admin').get('/status-labels/invoice').expect(404);
  });
});
