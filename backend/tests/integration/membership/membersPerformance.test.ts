import request from 'supertest';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();

/** NFR-PERF-05: the member list and search over 50,000 members. */
describe('Member list performance (M4 Slice 4)', () => {
  const tenantId = `t-wp-perf-${randomUUID()}`;
  const userId = `u-wpp-${randomUUID()}`;
  const app = createApp();
  let token = '';
  const get = (query: string) => request(app).get(`/api/${tenantId}/membership/members?${query}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId, urlSlug: tenantId } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Administrator], tenantId, firstName: 'Perf', lastName: 'Test' },
    });
    token = new JwtTokenService().sign({ userId, role: 'STAFF', tenantId, tenantSlug: tenantId } as any);

    const tiers = ['BRONZE', 'SILVER', 'GOLD', 'VIP'];
    for (let batch = 0; batch < 50; batch++) {
      await prisma.member.createMany({
        data: Array.from({ length: 1000 }, (_, i) => {
          const n = batch * 1000 + i + 1;
          return {
            id: randomUUID(), tenantId, memberNumber: `WP-${String(n).padStart(6, '0')}`, firstName: `First${n % 997}`, lastName: `Last${n}`, email: `m${n}@perf.example`,
            phone: `+35569${String(n).padStart(7, '0')}`, currentTier: tiers[n % 4], startsOn: new Date('2026-01-01'), cardToken: randomUUID(), createdBy: userId,
          };
        }),
      });
    }
    await prisma.$executeRawUnsafe('ANALYZE "Member"');
  }, 120_000);

  afterAll(async () => {
    await prisma.member.deleteMany({ where: { tenantId } });
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  }, 120_000);

  const timed = async (query: string) => {
    const started = Date.now();
    const res = await get(query).expect(200);
    return { ms: Date.now() - started, body: res.body };
  };

  it('NFR-PERF-05 lists a page of 50 of 50,000 members in under 1 second', async () => {
    await get('limit=50'); // warm the connection
    const { ms, body } = await timed('limit=50&sortBy=name');
    expect(body.total).toBe(50_000);
    expect(body.data).toHaveLength(50);
    expect(ms).toBeLessThan(1000);
  });

  it.each([
    ['member ID', 'query=WP-049999'],
    ['email', 'query=m31337@perf.example'],
    ['phone', 'query=%2B355690012345'],
    ['name', 'query=Last777'],
    ['tier and status', 'tier=GOLD&status=ACTIVE&limit=50'],
  ])('NFR-PERF-05 searches by %s in under 1 second', async (_label, query) => {
    const { ms, body } = await timed(query);
    expect(body.total).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
});
