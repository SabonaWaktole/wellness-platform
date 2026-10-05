import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaContractWriteTransaction } from '../../../src/contracts/infrastructure/PrismaContractWriteTransaction';
import { PrismaContractSettingsStore } from '../../../src/contracts/infrastructure/PrismaContractSettingsStore';
import { UpdateContractSettingsUseCase } from '../../../src/contracts/application/use-cases/ContractSettingsUseCases';
import { administrator } from '../../support/access';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/** M3 Slice 3 end to end: the Administrator's contract settings and their audit trail. */
describe('Contract settings (M3 Slice 3)', () => {
  const tenantId = `t-contract-settings-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-cs-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), manager: uid('manager'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: () => auth(request(app).get(`/api/${slug}/settings/contracts`)),
      patch: (body: object) => auth(request(app).patch(`/api/${slug}/settings/contracts`)).send(body),
    };
  };
  const audit = () => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'ContractSettings' }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Contract settings tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('a workspace that never saved settings reads the defaults, and no row is created by reading', async () => {
    const res = await as('admin').get().expect(200);
    expect(res.body.data).toEqual({ reminderLeadDays: [60, 30, 7], expiringSoonDays: 30, paymentGraceDays: 0, numberPrefix: 'CTR' });
    expect(await prisma.contractSettings.count({ where: { tenantId } })).toBe(0);
  });

  it('FR-REN-01 the Administrator sets 90 and 30; the read returns them and the audit log shows the change', async () => {
    const res = await as('admin').patch({ reminderLeadDays: [30, 90] }).expect(200);
    expect(res.body.data.reminderLeadDays).toEqual([90, 30]);
    expect((await as('admin').get().expect(200)).body.data.reminderLeadDays).toEqual([90, 30]);

    const entries = await audit();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: users.admin, action: 'UPDATE', entityId: tenantId });
    expect(entries[0].changes).toEqual([{ field: 'reminderLeadDays', old: [60, 30, 7], new: [90, 30] }]);
  });

  it('FR-REN-04, FR-PAY-09, FR-CON-05 every setting saves, and each change is audited with old and new values', async () => {
    await as('admin').patch({ expiringSoonDays: 45, paymentGraceDays: 3, numberPrefix: 'WA' }).expect(200);
    expect((await as('admin').get().expect(200)).body.data).toEqual({
      reminderLeadDays: [90, 30],
      expiringSoonDays: 45,
      paymentGraceDays: 3,
      numberPrefix: 'WA',
    });
    const last = (await audit()).at(-1)!;
    expect(last.changes).toEqual([
      { field: 'expiringSoonDays', old: 30, new: 45 },
      { field: 'paymentGraceDays', old: 0, new: 3 },
      { field: 'numberPrefix', old: 'CTR', new: 'WA' },
    ]);
  });

  it('FR-AUD-11 saving the values already stored writes no audit entry', async () => {
    const before = (await audit()).length;
    await as('admin').patch({ expiringSoonDays: 45 }).expect(200);
    expect(await audit()).toHaveLength(before);
  });

  it.each([
    ['reminderLeadDays', { reminderLeadDays: [] }],
    ['reminderLeadDays', { reminderLeadDays: [30, 30] }],
    ['reminderLeadDays', { reminderLeadDays: [0, 30] }],
    ['reminderLeadDays', { reminderLeadDays: [400] }],
    ['reminderLeadDays', { reminderLeadDays: [90, 60, 30, 14, 7, 1] }],
    ['expiringSoonDays', { expiringSoonDays: 0 }],
    ['paymentGraceDays', { paymentGraceDays: 31 }],
    ['numberPrefix', { numberPrefix: 'ctr' }],
    ['numberPrefix', { numberPrefix: 'C' }],
  ])('FR-REN-01 refuses an invalid %s with a 400 naming the field, and changes nothing', async (field, body) => {
    const before = (await audit()).length;
    const res = await as('admin').patch(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_CONTRACT_SETTINGS', field });
    expect(await audit()).toHaveLength(before);
  });

  it('an unknown field is refused', async () => {
    expect((await as('admin').patch({ somethingElse: 1 })).status).toBe(400);
  });

  it.each(['manager', 'sales', 'reception'] as Who[])('a %s gets 403 on both read and write', async (who) => {
    expect((await as(who).get()).status).toBe(403);
    expect((await as(who).patch({ expiringSoonDays: 10 })).status).toBe(403);
  });

  it('FR-AUD-11 a failed audit write rolls the settings change back', async () => {
    const before = await prisma.contractSettings.findUniqueOrThrow({ where: { tenantId } });
    const failingTx = new PrismaContractWriteTransaction(prisma, () => ({
      record: async () => {
        throw new Error('audit write failed');
      },
    }));
    const useCase = new UpdateContractSettingsUseCase(new PrismaContractSettingsStore(prisma), failingTx);

    await expect(
      useCase.execute({ access: administrator({ userId: users.admin, tenantId }), tenantId, patch: { expiringSoonDays: 99 } })
    ).rejects.toThrow('audit write failed');

    const after = await prisma.contractSettings.findUniqueOrThrow({ where: { tenantId } });
    expect(after.expiringSoonDays).toBe(before.expiringSoonDays);
  });
});
