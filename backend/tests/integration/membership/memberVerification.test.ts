import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { addDays } from '../../../src/contracts/domain/calendarDay';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { createPublicVerifyRouter } from '../../../src/membership/interfaces/http/publicVerifyRoutes';
import { hashAddress } from '../../../src/membership/domain/verification';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));

/**
 * M4 Slice 13: Reception and partner-clinic verification (FR-VER-01..10,
 * FR-BEN-03, FR-BEN-04, FR-RBAC-27, FR-RBAC-30, NFR-SEC-08).
 */
describe('Member verification (M4 Slice 13)', () => {
  const tenantId = `t-wp-ver-${randomUUID()}`;
  const otherTenantId = `t-wp-ver2-${randomUUID()}`;
  const uid = (label: string) => `u-wpv-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), agent: uid('agent'), reception: uid('reception'), sales: uid('sales'), otherReception: uid('other') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });
  const verify = (who: Who) => ({
    byToken: (token: string, slug = tenantId) => authed(who)(request(app).get(`/api/${slug}/membership/verify/by-token/${token}`)),
    search: (query: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/verify/search`).query({ query })),
    member: (id: string) => authed(who)(request(app).post(`/api/${tenantId}/membership/verify/members/${id}`)),
    identity: (verificationId: string, choice: string) => authed(who)(request(app).patch(`/api/${tenantId}/membership/verify/${verificationId}/identity`)).send({ choice }),
  });
  const publicVerify = (token: string) => request(app).get(`/api/public/verify/${token}`);

  let counter = 0;
  const register = async (extra: Record<string, unknown> = {}) => {
    counter += 1;
    const res = await members('agent')
      .post('', { firstName: 'Verify', lastName: `Holder${counter}`, email: `ver${counter}-${randomUUID().slice(0, 6)}@example.com`, phone: `+3556${String(counter).padStart(7, '0')}`, dateOfBirth: '1990-05-17', ...extra })
      .expect(201);
    const id = res.body.data.id as string;
    const row = await prisma.member.findUniqueOrThrow({ where: { id } });
    return { id, token: row.cardToken, memberNumber: row.memberNumber, email: res.body.data.email as string, phone: res.body.data.phone as string };
  };
  const term = (memberId: string, t: { tier: string; source: string; startsOn: string; endsOn: string | null }) =>
    prisma.memberTerm.create({ data: { id: randomUUID(), memberId, tier: t.tier, source: t.source, startsOn: asDate(t.startsOn), endsOn: t.endsOn ? asDate(t.endsOn) : null } });
  const gold = async (extra: Record<string, unknown> = {}) => {
    const m = await register(extra);
    await term(m.id, { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -30), endsOn: plusDays(today(), 300) });
    return m;
  };

  beforeAll(async () => {
    app = createApp();
    for (const id of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id, name: 'Wellness Verify Test', urlSlug: id, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const otherRoles = await seedSystemRoles(prisma, otherTenantId);
    const agentRoleId = `r-${randomUUID()}`;
    await prisma.role.create({
      data: { id: agentRoleId, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: ['members.view', 'members.manage'].map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
    });
    const user = (id: string, roleId: string, firstName: string, tenant = tenantId) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId: tenant, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.agent, agentRoleId, 'Mira'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.otherReception, otherRoles[RoleKey.Reception], 'Olta', otherTenantId),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      const tenant = who === 'otherReception' ? otherTenantId : tenantId;
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId: tenant, tenantSlug: tenant } as any);
    }
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    await new PrismaMembershipSeeder(prisma).seed(otherTenantId);
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) await new PrismaTenantDeletionTransaction(prisma).run(id);
    await prisma.$disconnect();
  });

  describe('Reception', () => {
    it('FR-VER-01 finds a member by the scanned token, and by member ID, name, phone and email', async () => {
      const m = await gold();

      const scanned = await verify('reception').byToken(m.token).expect(200);
      expect(scanned.body.data).toMatchObject({ found: true, valid: true, memberNumber: m.memberNumber });

      for (const query of [m.memberNumber, `Holder${counter}`, m.phone, m.email]) {
        const hits = (await verify('reception').search(query).expect(200)).body.data;
        expect(hits.map((h: any) => h.id)).toContain(m.id);
        expect(Object.keys(hits[0]).sort()).toEqual(['id', 'memberNumber', 'name']);
      }
      const picked = await verify('reception').member(m.id).expect(200);
      expect(picked.body.data).toMatchObject({ found: true, valid: true, memberNumber: m.memberNumber });
    });

    it('FR-VER-02 the response holds exactly the allowed fields for a Gold member and nothing about money or contact', async () => {
      const m = await gold({ note: 'secret note about the person' });
      const res = await verify('reception').byToken(m.token).expect(200);

      expect(Object.keys(res.body)).toEqual(['data']);
      expect(Object.keys(res.body.data).sort()).toEqual(['dateOfBirth', 'discounts', 'found', 'memberNumber', 'name', 'reason', 'status', 'tier', 'valid', 'validUntil', 'verificationId'].sort());
      expect(Object.keys(res.body.data.tier).sort()).toEqual(['colour', 'labelEn', 'labelSq', 'tier']);
      expect(res.body.data).toMatchObject({ valid: true, reason: null, name: `Verify Holder${counter}`, status: 'ACTIVE', dateOfBirth: '1990-05-17', validUntil: plusDays(today(), 300) });
      expect(res.body.data.tier.tier).toBe('GOLD');
      expect(res.body.data.discounts.length).toBeGreaterThan(0);
      const body = JSON.stringify(res.body);
      for (const secret of ['example.com', '+3556', 'secret note', 'employer', 'payment', 'receipt', 'fee']) expect(body).not.toContain(secret);
    });

    it('FR-VER-02 a suspended member is "Not valid: Suspended" with no discounts, and a closed one says Closed', async () => {
      const m = await gold();
      await members('agent').post(`/${m.id}/status`, { action: 'SUSPEND', reason: 'Payment dispute' }).expect(200);
      const suspended = (await verify('reception').byToken(m.token).expect(200)).body.data;
      expect(suspended).toMatchObject({ valid: false, reason: 'SUSPENDED', status: 'SUSPENDED', discounts: [] });

      await members('agent').post(`/${m.id}/status`, { action: 'CLOSE', reason: 'Left' }).expect(200);
      expect((await verify('reception').byToken(m.token).expect(200)).body.data).toMatchObject({ valid: false, reason: 'CLOSED', discounts: [] });
    });

    it('FR-VER-03 both identity answers are stored on the check, and "Does not match" shows on the member page', async () => {
      const m = await gold();
      const first = (await verify('reception').byToken(m.token).expect(200)).body.data.verificationId;
      await verify('reception').identity(first, 'CONFIRMED').expect(200);
      const second = (await verify('reception').byToken(m.token).expect(200)).body.data.verificationId;
      await verify('reception').identity(second, 'MISMATCH').expect(200);

      const rows = await prisma.verificationEvent.findMany({ where: { memberId: m.id }, orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.identityChoice)).toEqual(['CONFIRMED', 'MISMATCH']);
      const page = (await members('agent').get(`/${m.id}`).expect(200)).body.data;
      expect(page.verificationEvents.map((e: any) => e.identityChoice)).toEqual(['MISMATCH', 'CONFIRMED']);
    });

    it('FR-VER-03 an unknown choice, another user\'s check and another workspace\'s check are refused', async () => {
      const m = await gold();
      const id = (await verify('reception').byToken(m.token).expect(200)).body.data.verificationId;
      await verify('reception').identity(id, 'NONE').expect(400);
      await verify('reception').identity(id, 'maybe').expect(400);
      await verify('reception').identity('nope', 'CONFIRMED').expect(404);
      await authed('otherReception')(request(app).patch(`/api/${otherTenantId}/membership/verify/${id}/identity`)).send({ choice: 'CONFIRMED' }).expect(404);
      expect((await prisma.verificationEvent.findUniqueOrThrow({ where: { id } })).identityChoice).toBe('NONE');
    });

    it('FR-VER-04 an unknown, malformed, replaced or other-workspace token shows "Member not found" and nothing else', async () => {
      const m = await gold();
      await members('admin').post(`/${m.id}/card-link/replace`).expect(200);
      const other = await prisma.member.create({
        data: { id: randomUUID(), tenantId: otherTenantId, memberNumber: 'WP-X-1', firstName: 'Other', lastName: 'Place', startsOn: asDate(today()), cardToken: `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 11)}`, createdBy: users.otherReception },
      });

      for (const token of ['A'.repeat(43), 'not-a-token', m.token, other.cardToken]) {
        const res = await verify('reception').byToken(token).expect(200);
        expect(Object.keys(res.body.data).sort()).toEqual(['found', 'verificationId']);
        expect(res.body.data.found).toBe(false);
      }
      const logged = await prisma.verificationEvent.findMany({ where: { tenantId, result: 'NOT_FOUND', userId: users.reception } });
      expect(logged.length).toBeGreaterThanOrEqual(4);
    });

    it('FR-VER-05 every answer is no-store, and after a suspension the next check of the same card shows Not valid', async () => {
      const m = await gold();
      const before = await verify('reception').byToken(m.token).expect(200);
      expect(before.headers['cache-control']).toBe('no-store');
      expect(before.body.data.valid).toBe(true);

      await members('agent').post(`/${m.id}/status`, { action: 'SUSPEND', reason: 'Dispute' }).expect(200);
      const after = await verify('reception').byToken(m.token).expect(200);
      expect(after.body.data).toMatchObject({ valid: false, reason: 'SUSPENDED' });
    });

    it('FR-VER-06 two checks appear on the member page with the user, the time, the channel and the result', async () => {
      const m = await gold();
      await verify('reception').byToken(m.token).expect(200);
      await verify('reception').member(m.id).expect(200);

      const events = (await members('agent').get(`/${m.id}`).expect(200)).body.data.verificationEvents;
      expect(events).toHaveLength(2);
      expect(events.map((e: any) => e.channel).sort()).toEqual(['RECEPTION_SCAN', 'RECEPTION_SEARCH']);
      for (const e of events) {
        expect(e).toMatchObject({ result: 'VALID', identityChoice: 'NONE', by: 'Gent Test' });
        expect(new Date(e.at).getTime()).toBeGreaterThan(Date.now() - 60_000);
      }
    });

    it('FR-RBAC-27 a user without "Members: view" gets no verification log, and a Sales User cannot verify at all', async () => {
      const m = await gold();
      await verify('reception').byToken(m.token).expect(200);
      await members('reception').get(`/${m.id}`).expect(403);
      await verify('sales').byToken(m.token).expect(403);
      await verify('sales').search('Verify').expect(403);
      await verify('agent').byToken(m.token).expect(403);
    });

    it('FR-BEN-03 the discounts shown equal the benefit table for the effective tier', async () => {
      const m = await gold();
      const table = (await authed('reception')(request(app).get(`/api/${tenantId}/membership/benefits`)).expect(200)).body.data;
      const shown = (await verify('reception').byToken(m.token).expect(200)).body.data.discounts;

      const services = (table.services ?? table) as any[];
      const expected = services.filter((s) => s.active !== false && s.discounts?.GOLD != null).map((s) => ({ nameSq: s.nameSq, nameEn: s.nameEn, percent: String(s.discounts.GOLD) }));
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.map((d: any) => ({ ...d, percent: Number(d.percent) }))).toEqual(expected.map((d) => ({ ...d, percent: Number(d.percent) })));
    });

    it('FR-BEN-04 Reception reads the benefit table and cannot edit it', async () => {
      await authed('reception')(request(app).get(`/api/${tenantId}/membership/benefits`)).expect(200);
      await authed('reception')(request(app).post(`/api/${tenantId}/membership/settings/benefits`)).send({ nameSq: 'x', nameEn: 'x' }).expect(403);
    });
  });

  describe('the public page', () => {
    it('FR-VER-07 a valid member shows name, member ID, tier and valid-until and nothing else', async () => {
      const m = await gold({ note: 'secret note' });
      const res = await publicVerify(m.token).expect(200);

      expect(Object.keys(res.body)).toEqual(['data']);
      expect(Object.keys(res.body.data).sort()).toEqual(['memberNumber', 'name', 'tier', 'valid', 'validUntil']);
      expect(Object.keys(res.body.data.tier).sort()).toEqual(['colour', 'labelEn', 'labelSq', 'tier']);
      expect(res.body.data).toMatchObject({ valid: true, name: `Verify Holder${counter}`, memberNumber: m.memberNumber, validUntil: plusDays(today(), 300) });
      const body = JSON.stringify(res.body);
      for (const secret of ['1990', 'example.com', '+3556', 'secret note', 'employer', 'discount', 'payment', 'status']) expect(body).not.toContain(secret);
    });

    it('FR-VER-08 the same token gives two different shapes to Reception and to anyone else; a session without "verify" gets the public one', async () => {
      const m = await gold();
      const reception = (await verify('reception').byToken(m.token).expect(200)).body.data;
      const anyone = (await publicVerify(m.token).expect(200)).body.data;
      expect(reception).toHaveProperty('dateOfBirth');
      expect(anyone).not.toHaveProperty('dateOfBirth');
      expect(anyone).not.toHaveProperty('discounts');

      // A logged-in user without "Members: verify" is refused by the staff route, and the page then falls back to the public route.
      await verify('sales').byToken(m.token).expect(403);
      const withSession = await authed('sales')(request(app).get(`/api/public/verify/${m.token}`)).expect(200);
      expect(withSession.body.data).toEqual(anyone);
    });

    it('FR-VER-09 suspended, closed, replaced and unknown cards give the same status, headers and body', async () => {
      const suspended = await gold();
      await members('agent').post(`/${suspended.id}/status`, { action: 'SUSPEND', reason: 'Dispute' }).expect(200);
      const closed = await gold();
      await members('agent').post(`/${closed.id}/status`, { action: 'CLOSE', reason: 'Left' }).expect(200);
      const replaced = await gold();
      await members('admin').post(`/${replaced.id}/card-link/replace`).expect(200);

      const answers = [];
      for (const token of [suspended.token, closed.token, replaced.token, 'Z'.repeat(43), 'not-a-token']) {
        const res = await publicVerify(token);
        answers.push({ status: res.status, body: res.body, cache: res.headers['cache-control'] });
      }
      for (const a of answers) expect(a).toEqual(answers[0]);
      expect(answers[0]).toEqual({ status: 200, body: { data: { valid: false } }, cache: 'no-store' });
    });

    it('FR-VER-10 each scan of a known card leaves a row with a keyed hash of the address and no readable address', async () => {
      const m = await gold();
      await publicVerify(m.token).set('X-Forwarded-For', '203.0.113.9').expect(200);
      await publicVerify(m.token).expect(200);

      const rows = await prisma.verificationEvent.findMany({ where: { memberId: m.id } });
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r).toMatchObject({ channel: 'PARTNER_SCAN', result: 'VALID', userId: null, identityChoice: 'NONE' });
        expect(r.ipHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(r)).not.toMatch(/\d+\.\d+\.\d+\.\d+|::1|127\.0\.0\.1/);
      }
      expect(rows[0].ipHash).not.toBe(hashAddress('127.0.0.1', 'any'));
    });

    it('FR-VER-10 a suspended member is logged as NOT_VALID, and an unknown token (which belongs to no workspace) is not logged', async () => {
      const m = await gold();
      await members('agent').post(`/${m.id}/status`, { action: 'SUSPEND', reason: 'Dispute' }).expect(200);
      const before = await prisma.verificationEvent.count();
      await publicVerify(m.token).expect(200);
      await publicVerify('Y'.repeat(43)).expect(200);

      expect(await prisma.verificationEvent.count()).toBe(before + 1);
      expect((await prisma.verificationEvent.findFirstOrThrow({ where: { memberId: m.id } })).result).toBe('NOT_VALID');
    });

    it('FR-CRD-08 the answer is no-store and noindex with no cookie', async () => {
      const m = await gold();
      const res = await publicVerify(m.token).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-robots-tag']).toMatch(/noindex/);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('NFR-SEC-08 the 301st request in an hour from one address is refused, the 300th is not', async () => {
      const limited = createApp();
      const token = 'C'.repeat(43);
      for (let i = 1; i <= 300; i += 1) {
        const res = await request(limited).get(`/api/public/verify/${token}`);
        if (res.status === 429) throw new Error(`refused too early, at request ${i}`);
      }
      expect((await request(limited).get(`/api/public/verify/${token}`)).status).toBe(429);
    }, 60_000);

    it('NFR-SEC-08 the limit is read from the deployment setting', async () => {
      const bare = express();
      bare.use('/verify', createPublicVerifyRouter({ execute: async () => ({ valid: false as const }) } as any, 2));
      await request(bare).get('/verify/x').expect(200);
      await request(bare).get('/verify/x').expect(200);
      await request(bare).get('/verify/x').expect(429);
    });

    it('FR-AUD-16 a failure is logged without the token, and the client gets a fixed error', async () => {
      const secret = 'D'.repeat(43);
      const bare = express();
      bare.use('/verify', createPublicVerifyRouter({ execute: async () => { throw new Error(`Invalid invocation where: { cardToken: "${secret}" }`); } } as any, 100));
      const logged: string[] = [];
      const spies = (['log', 'error', 'warn', 'info'] as const).map((level) => jest.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); }));
      try {
        const res = await request(bare).get(`/verify/${secret}`).expect(500);
        expect(JSON.stringify(res.body)).not.toContain(secret);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      expect(logged.join('\n')).not.toContain(secret);
    });
  });
});
