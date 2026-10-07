import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { PrismaMembershipWriteTransaction } from '../../../src/membership/infrastructure/PrismaMembershipWriteTransaction';
import { PrismaMembershipSettingsStore } from '../../../src/membership/infrastructure/PrismaMembershipSettingsStore';
import { UpdateMembershipSettingsUseCase } from '../../../src/membership/application/use-cases/MembershipSettingsUseCases';
import { generatePostgresMembershipSeedSql } from '../../../scripts/generate-membership-seed-sql';
import { administrator } from '../../support/access';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/** M4 Slice 3 end to end: Wellness+ settings, the benefit table and their audit trail. */
describe('Wellness+ settings and benefit table (M4 Slice 3)', () => {
  const tenantId = `t-wp-settings-${randomUUID()}`;
  const otherTenantId = `t-wp-other-${randomUUID()}`;
  const uid = (label: string) => `u-wps-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), manager: uid('manager'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;

  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    const base = `/api/${tenantId}/membership`;
    return {
      get: (p: string) => auth(request(app).get(base + p)),
      post: (p: string, body: object) => auth(request(app).post(base + p)).send(body),
      patch: (p: string, body: object) => auth(request(app).patch(base + p)).send(body),
    };
  };
  const audit = () => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'MembershipSettings' }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, name: id, urlSlug: id } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const user = (id: string, roleId: string, firstName: string) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.ceo, roles[RoleKey.Ceo], 'Cem'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    }
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    await new PrismaMembershipSeeder(prisma).seed(otherTenantId);
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) await new PrismaTenantDeletionTransaction(prisma).run(id);
    await prisma.$disconnect();
  });

  describe('seeds', () => {
    it('FR-BEN-02 a new workspace has the 14 services and Gold physiotherapy at 30%, VIP equal to Gold', async () => {
      const res = await as('admin').get('/benefits').expect(200);
      expect(res.body.data.services).toHaveLength(14);
      const physio = res.body.data.services.find((s: any) => s.nameEn.startsWith('Physiotherapy'));
      expect(physio.discounts).toEqual({ BRONZE: '10.00', SILVER: '20.00', GOLD: '30.00', VIP: '30.00' });
      const labTests = res.body.data.services.find((s: any) => s.nameEn === 'Laboratory tests');
      expect(labTests.discounts).toEqual({ BRONZE: null, SILVER: '15.00', GOLD: null, VIP: null });
    });

    it('FR-TIR-01 the four tiers are seeded with the SRS fees', async () => {
      const res = await as('admin').get('/settings').expect(200);
      expect(res.body.data.tiers.map((t: any) => [t.tier, t.fee, t.termMonths])).toEqual([
        ['BRONZE', null, null],
        ['SILVER', '60.00', 12],
        ['GOLD', '100.00', 12],
        ['VIP', null, 12],
      ]);
      expect(res.body.data.settings).toEqual({
        familyDiscountPercent: '50.00', graceDays: 0, expiringSoonDays: 30, memberPrefix: 'WP', receiptPrefix: 'RCP', vipReviewNoticeDays: 30,
      });
    });

    it('NFR-OPS-04 the migration seed adds the defaults to a workspace with none, and running it twice adds nothing', async () => {
      const bare = `t-wp-bare-${randomUUID()}`;
      await prisma.tenant.create({ data: { id: bare, name: bare, urlSlug: bare } });
      const sql = generatePostgresMembershipSeedSql();
      const counts = async () => ({
        tiers: await prisma.tierSetting.count({ where: { tenantId: bare } }),
        rules: await prisma.membershipSettings.count({ where: { tenantId: bare } }),
        relationships: await prisma.familyRelationship.count({ where: { tenantId: bare } }),
        services: await prisma.benefitService.count({ where: { tenantId: bare } }),
        discounts: await prisma.benefitDiscount.count({ where: { service: { tenantId: bare } } }),
      });
      const run = async () => {
        // The generated block is statements separated by blank lines; comments are skipped by the server.
        for (const statement of sql.split(/;\s*\n/).map((s) => s.trim()).filter((s) => /INSERT INTO/.test(s))) {
          await prisma.$executeRawUnsafe(statement.replace(/^-- BEGIN[^\n]*\n/, '').replace(/^--[^\n]*\n/gm, ''));
        }
      };
      try {
        await run();
        const first = await counts();
        expect(first).toEqual({ tiers: 4, rules: 1, relationships: 3, services: 14, discounts: 44 });
        await run();
        expect(await counts()).toEqual(first);
        // The seed through the migration matches the seed through the seeder.
        const viaSeeder = await prisma.benefitDiscount.count({ where: { service: { tenantId } } });
        expect(viaSeeder).toBe(first.discounts);
      } finally {
        await new PrismaTenantDeletionTransaction(prisma).run(bare);
      }
    });
  });

  describe('FR-TIR-01 tiers and fees', () => {
    it('changing the Gold fee to 110 stores 110.00 and writes one audit entry with old and new', async () => {
      const before = (await audit()).length;
      const res = await as('admin').patch('/settings/tiers/GOLD', { fee: '110' }).expect(200);
      expect(res.body.data.fee).toBe('110.00');
      expect((await prisma.tierSetting.findUniqueOrThrow({ where: { tenantId_tier: { tenantId, tier: 'GOLD' } } })).fee!.toString()).toBe('110');
      const entries = await audit();
      expect(entries).toHaveLength(before + 1);
      expect(entries.at(-1)).toMatchObject({ userId: users.admin, action: 'UPDATE', entityLabel: 'Tier GOLD' });
      expect(entries.at(-1)!.changes).toEqual([{ field: 'fee', old: '100.00', new: '110.00' }]);
    });

    it('FR-TIR-01 a fee on Bronze or VIP is refused with the field, and nothing is audited', async () => {
      const before = (await audit()).length;
      for (const tier of ['BRONZE', 'VIP']) {
        const res = await as('admin').patch(`/settings/tiers/${tier}`, { fee: '5.00' });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'INVALID_TIER_SETTING', field: 'fee' });
      }
      expect(await audit()).toHaveLength(before);
    });

    it('FR-TIR-01 labels are required in both languages, and an unknown tier is 404', async () => {
      expect((await as('admin').patch('/settings/tiers/SILVER', { labelEn: '' })).body).toMatchObject({ field: 'labelEn' });
      expect((await as('admin').patch('/settings/tiers/SILVER', { labelSq: '  ' })).body).toMatchObject({ field: 'labelSq' });
      expect((await as('admin').patch('/settings/tiers/PLATINUM', { labelSq: 'X' })).status).toBe(404);
    });

    it('FR-AUD-14 saving the stored values writes no audit entry', async () => {
      const before = (await audit()).length;
      await as('admin').patch('/settings/tiers/GOLD', { fee: '110.00' }).expect(200);
      expect(await audit()).toHaveLength(before);
    });
  });

  describe('FR-TIR-05, FR-TIR-10, FR-FAM-04, FR-MEM-03, FR-MPAY-05, FR-VIP-04 rules', () => {
    it('every rule saves and each change is audited with old and new values', async () => {
      await as('admin')
        .patch('/settings', { familyDiscountPercent: '40', graceDays: 14, expiringSoonDays: 45, memberPrefix: 'WA', receiptPrefix: 'REC', vipReviewNoticeDays: 20 })
        .expect(200);
      expect((await as('admin').get('/settings')).body.data.settings).toEqual({
        familyDiscountPercent: '40.00', graceDays: 14, expiringSoonDays: 45, memberPrefix: 'WA', receiptPrefix: 'REC', vipReviewNoticeDays: 20,
      });
      expect((await audit()).at(-1)!.changes).toEqual([
        { field: 'familyDiscountPercent', old: '50.00', new: '40.00' },
        { field: 'graceDays', old: 0, new: 14 },
        { field: 'expiringSoonDays', old: 30, new: 45 },
        { field: 'memberPrefix', old: 'WP', new: 'WA' },
        { field: 'receiptPrefix', old: 'RCP', new: 'REC' },
        { field: 'vipReviewNoticeDays', old: 30, new: 20 },
      ]);
    });

    it.each([
      ['familyDiscountPercent', { familyDiscountPercent: '100.5' }],
      ['graceDays', { graceDays: 61 }],
      ['expiringSoonDays', { expiringSoonDays: 0 }],
      ['memberPrefix', { memberPrefix: 'wa' }],
      ['receiptPrefix', { receiptPrefix: 'TOOLONG1' }],
      ['vipReviewNoticeDays', { vipReviewNoticeDays: 400 }],
    ])('refuses an invalid %s with a 400 naming the field, and changes nothing', async (field, body) => {
      const before = (await audit()).length;
      const res = await as('admin').patch('/settings', body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_MEMBERSHIP_SETTINGS', field });
      expect(await audit()).toHaveLength(before);
    });

    it('an unknown field is refused', async () => {
      expect((await as('admin').patch('/settings', { somethingElse: 1 })).status).toBe(400);
    });

    it('FR-AUD-14 a failed audit write rolls the settings change back', async () => {
      const failingTx = new PrismaMembershipWriteTransaction(prisma, () => ({
        record: async () => {
          throw new Error('audit write failed');
        },
      }));
      const useCase = new UpdateMembershipSettingsUseCase(new PrismaMembershipSettingsStore(prisma), failingTx);
      await expect(
        useCase.execute({ access: administrator({ userId: users.admin, tenantId }), tenantId, patch: { graceDays: 33 } })
      ).rejects.toThrow('audit write failed');
      expect((await prisma.membershipSettings.findUniqueOrThrow({ where: { tenantId } })).graceDays).toBe(14);
    });
  });

  describe('FR-FAM-02 relationships', () => {
    it('lists the seeded relationships, adds one and deactivates one; the deactivated one is not offered', async () => {
      const list = (await as('admin').get('/settings/relationships').expect(200)).body.data;
      expect(list.map((r: any) => r.nameEn)).toEqual(['Spouse or partner', 'Child', 'Parent']);

      const created = (await as('admin').post('/settings/relationships', { nameSq: 'Vëlla ose motër', nameEn: 'Sibling' }).expect(201)).body.data;
      expect(created).toMatchObject({ nameEn: 'Sibling', order: 4, active: true });

      await as('admin').patch(`/settings/relationships/${created.id}`, { active: false }).expect(200);
      const stored = await prisma.familyRelationship.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.active).toBe(false);
      const entries = (await audit()).filter((e) => e.entityId === created.id);
      expect(entries.map((e) => e.action)).toEqual(['CREATE', 'UPDATE']);
      expect(entries[1].changes).toEqual([{ field: 'active', old: true, new: false }]);
    });

    it('requires both names', async () => {
      const res = await as('admin').post('/settings/relationships', { nameSq: 'Kushëri', nameEn: '' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_RELATIONSHIP', field: 'nameEn' });
    });

    it("another workspace's relationship is a 404", async () => {
      const other = await prisma.familyRelationship.findFirstOrThrow({ where: { tenantId: otherTenantId } });
      expect((await as('admin').patch(`/settings/relationships/${other.id}`, { active: false })).status).toBe(404);
      expect((await prisma.familyRelationship.findUniqueOrThrow({ where: { id: other.id } })).active).toBe(true);
    });
  });

  describe('FR-BEN-01, FR-BEN-05 benefit table', () => {
    it('adding "Ultrasound" with 10% for Silver stores it and the table shows it', async () => {
      const res = await as('admin').post('/settings/benefits', { nameSq: 'Ultrazë', nameEn: 'Ultrasound', discounts: { SILVER: 10 } }).expect(201);
      expect(res.body.data.discounts).toEqual({ BRONZE: null, SILVER: '10.00', GOLD: null, VIP: null });
      const row = await prisma.benefitDiscount.findMany({ where: { serviceId: res.body.data.id } });
      expect(row.map((d) => [d.tier, d.percent.toString()])).toEqual([['SILVER', '10']]);
      expect((await audit()).at(-1)).toMatchObject({ action: 'CREATE', entityLabel: 'Benefit Ultrasound' });
    });

    it('FR-BEN-05 changing Gold physiotherapy from 30% to 35% writes one audit entry with old and new value', async () => {
      const physio = (await as('admin').get('/benefits')).body.data.services.find((s: any) => s.nameEn.startsWith('Physiotherapy'));
      const before = (await audit()).length;
      await as('admin').patch(`/settings/benefits/${physio.id}`, { discounts: { GOLD: '35' } }).expect(200);
      const entries = await audit();
      expect(entries).toHaveLength(before + 1);
      expect(entries.at(-1)!.changes).toEqual([{ field: 'discount.GOLD', old: '30.00', new: '35.00' }]);
      expect((await as('reception').get('/benefits')).body.data.services.find((s: any) => s.id === physio.id).discounts.GOLD).toBe('35.00');
    });

    it('an empty value clears a discount, and clearing it twice writes one entry', async () => {
      const lab = (await as('admin').get('/benefits')).body.data.services.find((s: any) => s.nameEn === 'Laboratory tests');
      await as('admin').patch(`/settings/benefits/${lab.id}`, { discounts: { SILVER: null } }).expect(200);
      expect(await prisma.benefitDiscount.count({ where: { serviceId: lab.id } })).toBe(0);
      const before = (await audit()).length;
      await as('admin').patch(`/settings/benefits/${lab.id}`, { discounts: { SILVER: '' } }).expect(200);
      expect(await audit()).toHaveLength(before);
    });

    it.each([[101], ['12.345'], [-1], ['abc']])('refuses the discount %p with a 400 naming discounts', async (value) => {
      const svc = (await as('admin').get('/benefits')).body.data.services[0];
      const res = await as('admin').patch(`/settings/benefits/${svc.id}`, { discounts: { GOLD: value } });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_BENEFIT', field: 'discounts' });
    });

    it('a deactivated service is hidden from the read-only table but stays for the Administrator', async () => {
      const ct = (await as('admin').get('/benefits')).body.data.services.find((s: any) => s.nameEn.startsWith('CT scan'));
      await as('admin').patch(`/settings/benefits/${ct.id}`, { active: false }).expect(200);
      expect((await as('reception').get('/benefits')).body.data.services.some((s: any) => s.id === ct.id)).toBe(false);
      expect((await as('admin').get('/benefits')).body.data.services.some((s: any) => s.id === ct.id)).toBe(true);
    });
  });

  describe('FR-BEN-04 read-only access and FR-RBAC-27 fees', () => {
    it('Reception and the CEO read the table with the tiers as columns, and it carries no fee', async () => {
      for (const who of ['reception', 'ceo'] as Who[]) {
        const res = await as(who).get('/benefits').expect(200);
        expect(res.body.data.tiers.map((t: any) => t.tier)).toEqual(['BRONZE', 'SILVER', 'GOLD', 'VIP']);
        expect(JSON.stringify(res.body)).not.toMatch(/"fee"/);
      }
    });

    it('Reception gets 403 on every settings read and write', async () => {
      const who = as('reception');
      expect((await who.get('/settings')).status).toBe(403);
      expect((await who.patch('/settings', { graceDays: 1 })).status).toBe(403);
      expect((await who.patch('/settings/tiers/GOLD', { fee: '1' })).status).toBe(403);
      expect((await who.get('/settings/relationships')).status).toBe(403);
      expect((await who.post('/settings/relationships', { nameSq: 'a', nameEn: 'a' })).status).toBe(403);
      expect((await who.post('/settings/benefits', { nameSq: 'a', nameEn: 'a' })).status).toBe(403);
      expect((await who.patch('/settings/benefits/x', { active: false })).status).toBe(403);
    });

    it.each(['manager', 'sales'] as Who[])('a %s with no Wellness+ permission gets 403 on the table and on settings', async (who) => {
      expect((await as(who).get('/benefits')).status).toBe(403);
      expect((await as(who).get('/settings')).status).toBe(403);
    });

    it('the CEO is read only: 403 on settings', async () => {
      expect((await as('ceo').get('/settings')).status).toBe(403);
    });
  });

  describe('FR-BEN-06 no usage recording and tenant isolation', () => {
    it('the membership routes offer no usage endpoint and the schema has no usage table', async () => {
      const router = require('../../../src/membership/interfaces/http/membershipSettingsRoutes');
      expect(Object.keys(router)).toEqual(['createMembershipSettingsRouter']);
      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`;
      expect(tables.map((t) => t.table_name).filter((n) => /usage|redeem|visit.*member/i.test(n) && !/VisitFrequency/.test(n))).toEqual([]);
    });

    it('the table read never returns another workspace’s services', async () => {
      const mine = (await as('admin').get('/benefits')).body.data.services.map((s: any) => s.id);
      const theirs = (await prisma.benefitService.findMany({ where: { tenantId: otherTenantId } })).map((s) => s.id);
      expect(mine.filter((id: string) => theirs.includes(id))).toEqual([]);
    });
  });
});
