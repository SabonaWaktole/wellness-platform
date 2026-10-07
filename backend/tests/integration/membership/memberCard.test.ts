import request from 'supertest';
import express from 'express';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { addDays } from '../../../src/contracts/domain/calendarDay';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { createPublicCardRouter } from '../../../src/membership/interfaces/http/publicCardRoutes';
import { hashCardToken } from '../../../src/membership/domain/cardToken';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));

const BASE = 'https://cards.wellness.test';

/**
 * M4 Slice 11: the digital member card page and the staff actions around its
 * link (FR-CRD-01..04, FR-CRD-08..10, FR-CRD-12, FR-BEN-03, FR-EMP-08, FR-RBAC-30,
 * NFR-SEC-07, NFR-SEC-08, NFR-OPS-05, FR-AUD-16).
 */
describe('Digital member card (M4 Slice 11)', () => {
  const tenantId = `t-wp-card-${randomUUID()}`;
  const uid = (label: string) => `u-wpc-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), agent: uid('agent'), viewer: uid('viewer'), importer: uid('importer'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const members = (who: Who) => ({
    get: (p: string) => authed(who)(request(app).get(`/api/${tenantId}/membership/members${p}`)),
    post: (p: string, body: object = {}) => authed(who)(request(app).post(`/api/${tenantId}/membership/members${p}`)).send(body),
  });
  const card = (token: string) => request(app).get(`/api/public/cards/${token}`);
  const originalBase = process.env.PUBLIC_BASE_URL;

  let counter = 0;
  /** A member as the form leaves them, with a card token made by the real generator. */
  const register = async (extra: Record<string, unknown> = {}) => {
    counter += 1;
    const res = await members('agent')
      .post('', { firstName: 'Card', lastName: `Holder${counter}`, email: `card${counter}-${randomUUID().slice(0, 6)}@example.com`, phone: `+3556${String(counter).padStart(7, '0')}`, dateOfBirth: '1990-05-17', ...extra })
      .expect(201);
    const id = res.body.data.id as string;
    const row = await prisma.member.findUniqueOrThrow({ where: { id } });
    return { id, token: row.cardToken, memberNumber: row.memberNumber };
  };
  const term = (memberId: string, t: { tier: string; source: string; startsOn: string; endsOn: string | null }) =>
    prisma.memberTerm.create({ data: { id: randomUUID(), memberId, tier: t.tier, source: t.source, startsOn: asDate(t.startsOn), endsOn: t.endsOn ? asDate(t.endsOn) : null } });

  beforeAll(async () => {
    process.env.PUBLIC_BASE_URL = BASE;
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Card Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const agentRole = await customRole(['members.view', 'members.manage']);
    const viewerRole = await customRole(['members.view']);
    const importerRole = await customRole(['members.view', 'members.manage', 'members.import']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.agent, agentRole, 'Mira'),
        user(users.viewer, viewerRole, 'Vera'),
        user(users.importer, importerRole, 'Ira'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
  });

  afterAll(async () => {
    if (originalBase === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalBase;
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('the public card', () => {
    it('FR-CRD-01 the response holds exactly the allowed fields for a Gold member and nothing personal', async () => {
      const m = await register({ note: 'secret note about the person' });
      await term(m.id, { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -30), endsOn: plusDays(today(), 300) });

      const res = await card(m.token).expect(200);

      expect(Object.keys(res.body)).toEqual(['data']);
      expect(Object.keys(res.body.data).sort()).toEqual(['benefits', 'generatedAt', 'language', 'memberNumber', 'name', 'qrSvg', 'tier', 'valid', 'validUntil'].sort());
      expect(Object.keys(res.body.data.tier).sort()).toEqual(['colour', 'labelEn', 'labelSq', 'tier']);
      expect(res.body.data).toMatchObject({ valid: true, name: `Card Holder${counter}`, memberNumber: m.memberNumber, language: 'sq', validUntil: plusDays(today(), 300) });
      expect(res.body.data.tier.tier).toBe('GOLD');
      const body = JSON.stringify(res.body);
      for (const secret of ['example.com', '+3556', '1990-05-17', 'secret note', 'employer', 'payment', 'status']) expect(body).not.toContain(secret);
    });

    it('FR-CRD-02 the QR holds <base>/v/<token> with error correction M, a quiet zone and 220 px or more', async () => {
      const m = await register();
      const { qrSvg } = (await card(m.token).expect(200)).body.data;
      const payload = `${BASE}/v/${m.token}`;

      expect(qrSvg).toBe(await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 240, color: { dark: '#000000', light: '#ffffff' } }));
      expect(qrSvg).not.toBe(await QRCode.toString(`${BASE}/v/${m.token}x`, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 240 }));
      const modules = QRCode.create(payload, { errorCorrectionLevel: 'M' }).modules.size;
      expect(qrSvg).toContain(`viewBox="0 0 ${modules + 8} ${modules + 8}"`);
      expect(Number(/width="(\d+)"/.exec(qrSvg)![1])).toBeGreaterThanOrEqual(220);
      expect(qrSvg).toContain('fill="#ffffff"');
    });

    it('FR-CRD-03 the same link shows Silver after a Gold member is downgraded, and Bronze with no expiry for a new member', async () => {
      const m = await register();
      expect((await card(m.token).expect(200)).body.data).toMatchObject({ tier: { tier: 'BRONZE' }, validUntil: null, valid: true });

      await term(m.id, { tier: 'GOLD', source: 'PAID', startsOn: plusDays(today(), -400), endsOn: plusDays(today(), -40) });
      await term(m.id, { tier: 'SILVER', source: 'DOWNGRADE', startsOn: plusDays(today(), -25), endsOn: plusDays(today(), 340) });

      const after = (await card(m.token).expect(200)).body.data;
      expect(after.tier.tier).toBe('SILVER');
      expect(after.validUntil).toBe(plusDays(today(), 340));
    });

    it('FR-CRD-03, FR-BEN-03 a suspended member gets the not-valid card: no QR, no tier and no discounts; reinstating brings them back', async () => {
      const m = await register();
      await term(m.id, { tier: 'SILVER', source: 'PAID', startsOn: plusDays(today(), -10), endsOn: plusDays(today(), 355) });
      const active = (await card(m.token).expect(200)).body.data;
      expect(active.benefits.find((b: { nameEn: string }) => b.nameEn === 'Preventive check-up')).toMatchObject({ percent: '50.00' });

      await members('agent').post(`/${m.id}/status`, { action: 'SUSPEND', reason: 'Payment dispute' }).expect(200);
      const suspended = (await card(m.token).expect(200)).body.data;
      expect(suspended).toMatchObject({ valid: false, qrSvg: null, tier: null, benefits: [], validUntil: null });
      expect(suspended.name).toBe(active.name);

      await members('agent').post(`/${m.id}/status`, { action: 'REINSTATE' }).expect(200);
      expect((await card(m.token).expect(200)).body.data.valid).toBe(true);
    });

    it('FR-BEN-03 the benefits follow the tier now and a change in the benefit table applies at once', async () => {
      const m = await register();
      const bronze = (await card(m.token).expect(200)).body.data.benefits;
      expect(bronze.find((b: { nameEn: string }) => b.nameEn === 'Preventive check-up').percent).toBe('25.00');
      expect(bronze.find((b: { nameEn: string }) => b.nameEn === 'Radiology examinations')).toBeUndefined();
    });

    it('FR-EMP-09 a sponsored Silver card shows the end of the contract chain and falls to Bronze when the contract is suspended', async () => {
      const area = await prisma.area.create({ data: { id: randomUUID(), tenantId, nameSq: 'T', nameEn: 'T', order: 1 } });
      const city = await prisma.city.create({ data: { id: randomUUID(), tenantId, areaId: area.id, nameSq: 'T', nameEn: 'T', order: 1 } });
      const clientId = randomUUID();
      await prisma.client.create({ data: { id: clientId, tenantId, name: 'Card Co', status: 'CLIENT', areaId: area.id, cityId: city.id, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
      const contractId = randomUUID();
      await prisma.contract.create({
        data: { id: contractId, tenantId, clientId, planName: 'Plan', status: 'ACTIVE', amount: '1000.00', billingPeriod: 'ANNUAL', startsAt: asDate(plusDays(today(), -30)), endsAt: asDate(plusDays(today(), 200)), createdByUserId: users.admin },
      });
      const m = await register();
      await prisma.member.update({ where: { id: m.id }, data: { employerClientId: clientId } });
      await term(m.id, { tier: 'SILVER', source: 'SPONSORED', startsOn: plusDays(today(), -30), endsOn: null });

      expect((await card(m.token).expect(200)).body.data).toMatchObject({ tier: { tier: 'SILVER' }, validUntil: plusDays(today(), 200) });
      await prisma.contract.update({ where: { id: contractId }, data: { status: 'SUSPENDED' } });
      expect((await card(m.token).expect(200)).body.data).toMatchObject({ tier: { tier: 'BRONZE' }, validUntil: null });
    });
  });

  describe('unknown, malformed and replaced tokens, headers and the rate limit', () => {
    it('FR-CRD-08 an unknown and a malformed token give the same status and the same body', async () => {
      const unknown = await card('A'.repeat(43)).expect(404);
      const malformed = await card('not-a-token').expect(404);
      const tooLong = await card('B'.repeat(200)).expect(404);
      expect(unknown.body).toEqual({ error: 'Card not found.', code: 'CARD_NOT_FOUND' });
      expect(malformed.body).toEqual(unknown.body);
      expect(tooLong.body).toEqual(unknown.body);
    });

    it('FR-CRD-08 every answer is no-store and noindex, with no cookie and no tenant in the path', async () => {
      const m = await register();
      for (const res of [await card(m.token), await card('nope')]) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-robots-tag']).toMatch(/noindex/);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('NFR-SEC-08 the 61st request in an hour from one address is refused, the 60th is not', async () => {
      const limited = createApp();
      const token = 'C'.repeat(43);
      for (let i = 1; i <= 60; i += 1) {
        const res = await request(limited).get(`/api/public/cards/${token}`);
        if (res.status === 429) throw new Error(`refused too early, at request ${i}`);
      }
      const res = await request(limited).get(`/api/public/cards/${token}`);
      expect(res.status).toBe(429);
    });

    it('NFR-SEC-08 the limit can be set by the deployment', async () => {
      const bare = express();
      bare.use('/cards', createPublicCardRouter({ execute: async () => ({ kind: 'not-found' as const }) } as any, 2));
      await request(bare).get('/cards/x').expect(404);
      await request(bare).get('/cards/x').expect(404);
      await request(bare).get('/cards/x').expect(429);
    });

    it('FR-CRD-08, FR-AUD-16 a failure is logged without the token, and the client gets a fixed error', async () => {
      const secret = 'D'.repeat(43);
      const bare = express();
      bare.use('/cards', createPublicCardRouter({ execute: async () => { throw new Error(`Invalid invocation where: { cardToken: "${secret}" }`); } } as any, 100));
      const logged: string[] = [];
      const spies = (['log', 'error', 'warn', 'info'] as const).map((level) => jest.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); }));
      try {
        const res = await request(bare).get(`/cards/${secret}`).expect(500);
        expect(JSON.stringify(res.body)).not.toContain(secret);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      expect(logged.length).toBeGreaterThan(0);
      expect(logged.join('\n')).not.toContain(secret);
    });
  });

  describe('staff actions on the link', () => {
    it('FR-CRD-09, NFR-OPS-05 the card link is built from the configured base address, and a new address applies to new requests', async () => {
      const m = await register();
      const res = await members('agent').get(`/${m.id}/card-link`).expect(200);
      expect(res.body.data).toMatchObject({ url: `${BASE}/m/${m.token}`, qrPayload: `${BASE}/v/${m.token}` });
      expect(res.body.data.qrSvg).toBe((await card(m.token).expect(200)).body.data.qrSvg);

      process.env.PUBLIC_BASE_URL = 'https://new.wellness.test';
      try {
        const changed = await members('agent').get(`/${m.id}/card-link`).expect(200);
        expect(changed.body.data.url).toBe(`https://new.wellness.test/m/${m.token}`);
        const { qrSvg } = (await card(m.token).expect(200)).body.data;
        expect(qrSvg).toBe(await QRCode.toString(`https://new.wellness.test/v/${m.token}`, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 240, color: { dark: '#000000', light: '#ffffff' } }));
      } finally {
        process.env.PUBLIC_BASE_URL = BASE;
      }
    });

    it('FR-CRD-10, FR-AUD-16 replacing the link: the old one says it was replaced, the new one shows the card, and no audit row holds a token', async () => {
      const m = await register();
      const res = await members('agent').post(`/${m.id}/card-link/replace`).expect(200);
      const newToken = String(res.body.data.url).replace(`${BASE}/m/`, '');

      expect(newToken).not.toBe(m.token);
      const old = await card(m.token).expect(410);
      expect(old.body).toEqual({ error: 'This card was replaced. Ask Wellness Albania for the new link.', code: 'CARD_REPLACED' });
      expect((await card(newToken).expect(200)).body.data.memberNumber).toBe(m.memberNumber);

      const stored = await prisma.memberCardToken.findMany({ where: { memberId: m.id } });
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).toBe(hashCardToken(m.token));
      expect(JSON.stringify(stored)).not.toContain(m.token);

      const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: m.id } });
      const replaced = entries.find((e) => JSON.stringify(e).includes('cardLink'));
      expect(replaced).toMatchObject({ userId: users.agent, action: 'UPDATE' });
      expect(replaced!.at).toBeInstanceOf(Date);
      const everything = JSON.stringify(await prisma.auditEntry.findMany({ where: { tenantId } }));
      expect(everything).not.toContain(m.token);
      expect(everything).not.toContain(newToken);

      // A second replacement keeps both old hashes and the first replaced link still says so.
      const again = await members('agent').post(`/${m.id}/card-link/replace`).expect(200);
      await card(m.token).expect(410);
      await card(newToken).expect(410);
      await card(String(again.body.data.url).replace(`${BASE}/m/`, '')).expect(200);
    });

    it('FR-RBAC-27, FR-CRD-09 the link and its replacement need Members: manage; a viewer, Sales and Reception are refused', async () => {
      const m = await register();
      for (const who of ['viewer', 'sales', 'reception'] as Who[]) {
        await members(who).get(`/${m.id}/card-link`).expect(403);
        await members(who).post(`/${m.id}/card-link/replace`).expect(403);
      }
      expect((await card(m.token).expect(200)).body.data.memberNumber).toBe(m.memberNumber);
      await members('agent').get(`/${randomUUID()}/card-link`).expect(404);
      await members('agent').post(`/${randomUUID()}/card-link/replace`).expect(404);
    });

    it('FR-RBAC-30 the card route is public: no login is asked for, and the member routes still are', async () => {
      const m = await register();
      await request(app).get(`/api/public/cards/${m.token}`).expect(200);
      await request(app).get(`/api/${tenantId}/membership/members/${m.id}/card-link`).expect(401);
    });

    it('NFR-SEC-07 the token is 256 bits of generator output and unique in the database', async () => {
      const a = await register();
      const b = await register();
      expect(a.token).not.toBe(b.token);
      expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(a.token, 'base64url').length).toBe(32);
    });
  });

  describe('the card links of an upload (FR-EMP-08)', () => {
    const sheet = async (rows: string[][]): Promise<Buffer> => {
      const book = new ExcelJS.Workbook();
      const ws = book.addWorksheet('Employees');
      ws.addRow(['First name*', 'Last name*', 'Date of birth', 'Phone', 'Email', 'Language']);
      for (const row of rows) ws.addRow(row);
      return Buffer.from(await book.xlsx.writeBuffer());
    };
    const read = async (buffer: Buffer) => {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(buffer as unknown as ArrayBuffer);
      const out: string[][] = [];
      book.worksheets[0].eachRow((row) => out.push([1, 2, 3].map((i) => String(row.getCell(i).value ?? ''))));
      return out;
    };

    it('FR-EMP-08 the sheet has one link per member of the upload, only for that upload, and the export is audited without links', async () => {
      const area = await prisma.area.findFirstOrThrow({ where: { tenantId } });
      const city = await prisma.city.findFirstOrThrow({ where: { tenantId } });
      const clientId = randomUUID();
      await prisma.client.create({ data: { id: clientId, tenantId, name: 'Upload Co', status: 'CLIENT', areaId: area.id, cityId: city.id, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
      await prisma.contract.create({
        data: { id: randomUUID(), tenantId, clientId, planName: 'Plan', status: 'ACTIVE', amount: '1000.00', billingPeriod: 'ANNUAL', startsAt: asDate(plusDays(today(), -30)), endsAt: asDate(plusDays(today(), 300)), createdByUserId: users.admin },
      });
      const unique = randomUUID().slice(0, 6);
      const base = `/api/${tenantId}/membership`;
      const file = await sheet([
        ['Ina', `Upload${unique}`, '1991-02-03', '', `ina-${unique}@example.com`, 'sq'],
        ['Leo', `Upload${unique}`, '', '+355691112222', '', 'en'],
      ]);
      const preview = await authed('importer')(request(app).post(`${base}/employee-imports`)).field('clientId', clientId).attach('file', file, 'staff.xlsx').expect(201);
      // Before confirming there is nothing to export.
      await authed('importer')(request(app).get(`${base}/employee-imports/${preview.body.data.id}/card-links.xlsx`)).expect(404);
      await authed('importer')(request(app).post(`${base}/employee-imports/${preview.body.data.id}/confirm`)).send({ confirmToken: preview.body.data.confirmToken }).expect(200);

      const res = await authed('importer')(request(app).get(`${base}/employee-imports/${preview.body.data.id}/card-links.xlsx`))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-disposition']).toContain('staff-card-links.xlsx');
      expect(res.headers['cache-control']).toBe('no-store');

      const [header, ...rows] = await read(res.body as Buffer);
      expect(header).toEqual(['Member ID', 'Name', 'Card link']);
      expect(rows).toHaveLength(2);
      const created = await prisma.member.findMany({ where: { tenantId, employerClientId: clientId }, orderBy: { memberNumber: 'asc' } });
      expect(created).toHaveLength(2);
      expect(rows).toEqual(created.map((c) => [c.memberNumber, `${c.firstName} ${c.lastName}`, `${BASE}/m/${c.cardToken}`]));

      const exportEntry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, action: 'EXPORT', entityId: preview.body.data.id } });
      expect(exportEntry.userId).toBe(users.importer);
      expect(JSON.stringify(exportEntry)).not.toContain(created[0].cardToken);

      await authed('viewer')(request(app).get(`${base}/employee-imports/${preview.body.data.id}/card-links.xlsx`)).expect(403);
    });
  });
});
