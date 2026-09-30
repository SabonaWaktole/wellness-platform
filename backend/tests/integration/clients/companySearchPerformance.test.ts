import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { seedSystemRoles } from '../../support/seedRoles';
import { ResolveAccessContextUseCase } from '../../../src/access/application/use-cases/ResolveAccessContextUseCase';
import { PrismaAccessRepository } from '../../../src/access/infrastructure/PrismaAccessRepository';
import { InMemoryAccessCache } from '../../../src/access/infrastructure/InMemoryAccessCache';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * NFR-PERF-01, measured again at the end of Slice 15: with 10,000 companies,
 * the list, a text search and a Slice 11 filter each return in under 1s.
 * Seeds with raw `createMany` (bypassing the domain) — this is a query
 * benchmark, not a re-test of company validation, which companyRecord.test.ts
 * already covers.
 */
describe('Company search performance (NFR-PERF-01)', () => {
  const tenantId = `t-perf-${randomUUID()}`;
  const slug = tenantId;
  const userId = `u-perf-admin-${randomUUID()}`;
  const salesUserId = `u-perf-sales-${randomUUID()}`;
  const managerId = `u-perf-manager-${randomUUID()}`;
  let app: express.Express;
  let token: string;
  let salesToken: string;
  let managerToken: string;
  let businessTypeId: string;
  let areaId: string;
  let cityId: string;

  // The full NFR-PERF-01 figure is 10,000, verified by hand (set
  // PERF_SEED_COUNT=10000) or in the Slice 15 hardening pass. CI's runner is
  // small and shared, and this suite already runs twice per job (parallel,
  // then --runInBand) alongside the rest of the backend suite — seeding
  // 10,000 rows there was enough added load to tip a couple of unrelated,
  // already-marginal tests into flaky connection failures. 2,000 rows still
  // exercises the same indexes and query plans as the full figure.
  const SEED_COUNT = Number(process.env.PERF_SEED_COUNT) || (process.env.CI ? 2_000 : 10_000);
  const MAX_MS = 1000;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Perf tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.Administrator], tenantId },
    });
    token = tokenService.sign({ userId, role: 'STAFF', tenantId, tenantSlug: slug } as any);
    await prisma.user.createMany({
      data: [
        { id: salesUserId, email: `${salesUserId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesUser], tenantId },
        { id: managerId, email: `${managerId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesManager], tenantId },
      ],
    });
    salesToken = tokenService.sign({ userId: salesUserId, role: 'STAFF', tenantId, tenantSlug: slug } as any);
    managerToken = tokenService.sign({ userId: managerId, role: 'STAFF', tenantId, tenantSlug: slug } as any);

    const cafe = await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq: 'Kafene' } });
    const tirana = await prisma.area.findFirstOrThrow({ where: { tenantId, nameSq: 'Tiranë' } });
    businessTypeId = cafe.id;
    areaId = tirana.id;
    cityId = (await prisma.city.findFirstOrThrow({ where: { tenantId, areaId, nameSq: 'Tiranë' } })).id;

    const now = new Date();
    const rows = Array.from({ length: SEED_COUNT }, (_, i) => ({
      id: `perf-client-${i}`,
      tenantId,
      name: `Perf Company ${i}`,
      status: 'PROSPECT',
      customFieldValues: {},
      businessTypeId,
      areaId,
      cityId,
      employeeCount: 10,
      // Half the companies belong to the Sales User, so the OWN and TEAM
      // scope filters are measured on a realistic split, not an empty set.
      assignedUserId: i % 2 === 0 ? salesUserId : null,
      lastUpdatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    }));
    // Batched: a single 10,000-row createMany is well within Postgres' and
    // MySQL's per-statement limits here (no relations, one insert each).
    await prisma.client.createMany({ data: rows });

    // One contact per company (FR-CMP-06 contact search), so the EXISTS
    // subquery the search adds is measured under the same load, not just
    // the plain name/email/phone columns.
    const contactRows = rows.map((r, i) => ({
      id: `perf-contact-${i}`,
      tenantId,
      clientId: r.id,
      name: `Perf Contact ${i}`,
      phone: `+35569${String(i).padStart(7, '0')}`,
      isPrimary: true,
      updatedAt: now,
    }));
    await prisma.contactPerson.createMany({ data: contactRows });
  }, 120_000);

  afterAll(async () => {
    await prisma.contactPerson.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  const timed = async (path: string, as: string = token) => {
    const start = Date.now();
    const res = await request(app).get(`/api/${slug}/clients${path}`).set('Authorization', `Bearer ${as}`);
    return { res, elapsedMs: Date.now() - start };
  };

  const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];

  it('lists the first page in under 1s', async () => {
    const { res, elapsedMs } = await timed('/search');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(SEED_COUNT);
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });

  it('a text search returns in under 1s', async () => {
    const { res, elapsedMs } = await timed(`/search?search=Perf Company ${SEED_COUNT - 1}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });

  it('a Slice 11 filter returns in under 1s', async () => {
    const { res, elapsedMs } = await timed(`/search?businessTypeId=${businessTypeId}&areaId=${areaId}&cityId=${cityId}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(SEED_COUNT);
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });

  it("NFR-PERF-01 a Sales User's OWN-scoped list returns in under 1s", async () => {
    const { res, elapsedMs } = await timed('/search', salesToken);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(Math.ceil(SEED_COUNT / 2));
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });

  it("NFR-PERF-01 a Sales Manager's TEAM-scoped text search returns in under 1s", async () => {
    const { res, elapsedMs } = await timed(`/search?search=Perf Company ${SEED_COUNT - 1}`, managerToken);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });

  /**
   * The permission check runs on every tenant request (loadAccess →
   * ResolveAccessContextUseCase). Cached, it must be negligible; on a cache
   * miss it is one indexed read of the user, role and grants.
   */
  it('NFR-PERF-01 the permission check adds under 5 ms p95 when cached, and under 100 ms p95 on a cache miss', async () => {
    const cache = new InMemoryAccessCache();
    const resolve = new ResolveAccessContextUseCase(new PrismaAccessRepository(prisma), cache);
    const input = { userId: salesUserId, tenantId, legacyRole: 'STAFF' };

    const cold: number[] = [];
    for (let i = 0; i < 30; i++) {
      cache.userChanged(salesUserId);
      const start = performance.now();
      await resolve.execute(input);
      cold.push(performance.now() - start);
    }

    const warm: number[] = [];
    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      await resolve.execute(input);
      warm.push(performance.now() - start);
    }

    console.log(`NFR-PERF-01 permission check p95: cached ${p95(warm).toFixed(3)} ms, cache miss ${p95(cold).toFixed(1)} ms`);
    expect(p95(warm)).toBeLessThan(5);
    expect(p95(cold)).toBeLessThan(100);
  });

  it('FR-CMP-06 a search matching only a contact phone returns in under 1s', async () => {
    const phone = `+35569${String(SEED_COUNT - 1).padStart(7, '0')}`;
    const { res, elapsedMs } = await timed(`/search?search=${encodeURIComponent(phone)}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(MAX_MS);
  });
});
