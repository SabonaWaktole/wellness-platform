import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

/** NFR-PERF-05: the Wellness+ reports over 50,000 members and 20,000 payments. */
describe('Wellness+ reports performance (M4 Slice 14)', () => {
  const tenantId = `t-wp-rptperf-${randomUUID()}`;
  const userId = `u-wprp-${randomUUID()}`;
  const app = createApp();
  let token = '';

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId, urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Ceo], tenantId, firstName: 'Perf', lastName: 'Test' },
    });
    token = new JwtTokenService().sign({ userId, role: 'STAFF', tenantId, tenantSlug: tenantId } as any);

    const tiers = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];
    const ids: string[] = [];
    for (let batch = 0; batch < 50; batch++) {
      const rows = Array.from({ length: 1000 }, (_, i) => {
        const n = batch * 1000 + i + 1;
        const id = randomUUID();
        ids.push(id);
        return {
          id, tenantId, memberNumber: `WP-${String(n).padStart(6, '0')}`, firstName: `First${n % 997}`, lastName: `Last${n}`, currentTier: tiers[n % 4],
          startsOn: new Date('2025-01-01'), createdAt: new Date('2025-01-02T10:00:00Z'), cardToken: randomBytes(32).toString('base64url'), createdBy: userId,
        };
      });
      await prisma.member.createMany({ data: rows });
      await prisma.memberStatusHistory.createMany({ data: rows.map((r) => ({ id: randomUUID(), memberId: r.id, fromStatus: null, toStatus: 'ACTIVE', createdAt: new Date('2025-01-02T10:00:00Z') })) });
      await prisma.memberTierHistory.createMany({
        data: rows.filter((r) => r.currentTier !== 'BRONZE').map((r) => ({ id: randomUUID(), memberId: r.id, fromTier: 'BRONZE', toTier: r.currentTier, reason: 'PURCHASE', createdAt: new Date('2025-01-15T10:00:00Z') })),
      });
    }
    for (let batch = 0; batch < 20; batch++) {
      await prisma.memberPayment.createMany({
        data: Array.from({ length: 1000 }, (_, i) => {
          const n = batch * 1000 + i;
          return {
            id: randomUUID(), tenantId, memberId: ids[n], kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', listFee: '60.00', discountPercent: 0, amount: '60.00', method: 'CASH',
            receivedOn: new Date(`2025-03-${String((n % 28) + 1).padStart(2, '0')}`), receiptNumber: `RCP-P-${n}`, recordedBy: userId,
          };
        }),
      });
    }
    for (const table of ['Member', 'MemberPayment', 'MemberStatusHistory', 'MemberTierHistory']) await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
  }, 300_000);

  afterAll(async () => {
    await prisma.member.deleteMany({ where: { tenantId } });
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  }, 300_000);

  const get = (query: Record<string, string>) => request(app).get(`/api/${tenantId}/membership/reports`).query(query).set('Authorization', `Bearer ${token}`);

  it('NFR-PERF-05 the whole report, with a monthly series over a quarter, opens in under 2 seconds at 50,000 members and 20,000 payments', async () => {
    await get({}).expect(200); // warm the connection
    const started = Date.now();
    const res = await get({ preset: 'CUSTOM', from: '2025-01-01', to: '2025-03-31' }).expect(200);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.body.data.active.total).toBe(50_000);
    expect(res.body.data.revenue).toMatchObject({ count: 20_000, total: '1200000.00' });
    expect(res.body.data.active.monthly.map((m: any) => m.total)).toEqual([50_000, 50_000, 50_000]);
  });
});
