import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaSalesScriptSeeder } from '../../../src/salesScript/infrastructure/PrismaSalesScriptSeeder';
import { PrismaSalesScriptWriteTransaction } from '../../../src/salesScript/infrastructure/PrismaSalesScriptWriteTransaction';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { DEFAULT_SALES_SCRIPT } from '../../../src/salesScript/domain/DefaultSalesScript';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const text = (value: string, marks?: object[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const heading = (value: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const bullets = (...items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(item)] }] })),
});
const doc = (...content: object[]) => ({ type: 'doc', content });

/**
 * M2 Slice 5 end to end (FR-SCR-03..07, NFR-SEC-05, FR-AUD-09): one script
 * per workspace. The Administrator saves drafts and publishes them; every
 * publish is a version with its author and date, and one audit entry in the
 * same transaction. Salespeople read only the published text.
 */
describe('Sales script (FR-SCR-03..07)', () => {
  const tenantId = `t-sales-script-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-sales-script-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), sales: uid('sales'), sales2: uid('sales2'), manager: uid('manager'), reception: uid('reception') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}/sales-script${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}/sales-script${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}/sales-script${path}`)).send(body),
    };
  };

  const published = async (who: keyof typeof users = 'sales', lang = 'sq') => (await as(who).get(`?lang=${lang}`).expect(200)).body.data;
  const saveDraft = (contentSq: object | string | null, contentEn: object | string | null = null) =>
    as('admin').put('/draft', { contentSq, contentEn });
  const publish = () => as('admin').post('/publish');
  const scriptAudits = () => prisma.auditEntry.findMany({ where: { tenantId, entityType: 'SalesScript' }, orderBy: { at: 'asc' } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Sales script tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaSalesScriptSeeder(prisma).seed(tenantId);

    const user = (id: string, roleId: string, firstName: string) => ({
      id,
      email: `${id}@example.com`,
      hashedPassword: 'x',
      role: 'STAFF',
      roleId,
      tenantId,
      firstName,
      lastName: 'Test',
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.sales2, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  it('FR-SCR-03 a new workspace starts with the placeholder script, published as version 1, with its sections', async () => {
    const data = await published();
    expect(data).toMatchObject({ version: 1, language: 'sq', content: DEFAULT_SALES_SCRIPT.contentSq });
    expect(data.sections.map((section: any) => section.title)).toEqual([
      'Hapja',
      'Zbulimi i nevojave',
      'Pyetje për çmimin',
      'Kundërshtimet',
      'Mbyllja',
    ]);
    expect(data.sections[0]).toEqual({ anchor: 'section-1', title: 'Hapja' });
  });

  it('FR-SCR-03 two Sales Users get identical content and the same section list', async () => {
    expect(await published('sales')).toEqual(await published('sales2'));
    expect(await published('sales', 'en')).toEqual(await published('sales2', 'en'));
    expect((await published('sales', 'en')).sections[0].title).toBe('Opening');
  });

  it('FR-SCR-04 saving a draft does not change what salespeople see; publishing does', async () => {
    const before = await published();
    const draft = (await saveDraft(doc(heading('Hapja'), bullets('Përshëndetni klientin me emër.')), doc(heading('Opening'))).expect(200)).body
      .data;
    expect(draft).toMatchObject({ version: 2, status: 'DRAFT', createdBy: { name: 'Ana Test' } });
    expect(await published()).toEqual(before);

    const result = (await publish().expect(200)).body.data;
    expect(result).toMatchObject({ version: 2, status: 'PUBLISHED', publishedBy: { name: 'Ana Test' } });
    const after = await published();
    expect(after.version).toBe(2);
    expect(after.content).toEqual(doc(heading('Hapja'), bullets('Përshëndetni klientin me emër.')));
    expect((await as('admin').get('/draft').expect(200)).body.data.draft).toBeNull();
  });

  it('FR-SCR-04 an empty English text falls back to the Albanian one', async () => {
    await saveDraft(doc(heading('Hapja'), bullets('Vetëm shqip.')), null).expect(200);
    await publish().expect(200);
    const english = await published('sales', 'en');
    expect(english).toMatchObject({ language: 'sq', content: doc(heading('Hapja'), bullets('Vetëm shqip.')) });
  });

  it('FR-SCR-04 saving again edits the same draft; a draft with no Albanian text cannot be published', async () => {
    const first = (await saveDraft(doc(bullets('Një'))).expect(200)).body.data;
    const second = (await saveDraft(doc(bullets('Dy'))).expect(200)).body.data;
    expect(second.version).toBe(first.version);
    expect(await prisma.salesScript.count({ where: { tenantId, status: 'DRAFT' } })).toBe(1);

    await saveDraft(null, doc(bullets('Only English'))).expect(200);
    const refused = (await publish().expect(400)).body;
    expect(refused).toMatchObject({ code: 'SCRIPT_EMPTY', field: 'contentSq' });

    await saveDraft(doc(bullets('Tre')), null).expect(200);
    await publish().expect(200);
    expect((await publish().expect(409)).body.code).toBe('NO_SCRIPT_DRAFT');
  });

  it('FR-SCR-05 each publish is one audit entry with the old and new text, and the version list names who published', async () => {
    const audits = await scriptAudits();
    const before = audits.length;
    await saveDraft(doc(bullets('Për auditim.')), doc(bullets('For the audit.'))).expect(200);
    expect(await scriptAudits()).toHaveLength(before);

    const current = await published();
    await publish().expect(200);
    const after = await scriptAudits();
    expect(after).toHaveLength(before + 1);
    const entry = after[after.length - 1];
    expect(entry).toMatchObject({ action: 'STATUS_CHANGE', entityId: tenantId, entityLabel: `v${current.version + 1}`, userId: users.admin });
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'version', old: current.version, new: current.version + 1 },
        { field: 'contentSq', old: 'Tre', new: 'Për auditim.' },
        { field: 'contentEn', old: null, new: 'For the audit.' },
      ])
    );

    const { versions, draft } = (await as('admin').get('/versions').expect(200)).body.data;
    expect(draft).toBeNull();
    expect(versions[0]).toMatchObject({ version: current.version + 1, status: 'PUBLISHED', publishedBy: { name: 'Ana Test' } });
    expect(versions.slice(1).every((v: any) => v.status === 'SUPERSEDED')).toBe(true);
    expect(versions[versions.length - 1]).toMatchObject({ version: 1, publishedBy: null });
    expect(versions.map((v: any) => v.version)).toEqual([...versions.map((v: any) => v.version)].sort((a, b) => b - a));

    const grouped = await request(app)
      .get(`/api/${slug}/audit?entityGroup=salesScript&limit=100`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    expect(grouped.body.data.length).toBe(before + 1);
    expect(new Set(grouped.body.data.map((e: any) => e.entityType))).toEqual(new Set(['SalesScript']));
  });

  it('FR-SCR-05 the Administrator can view an earlier version', async () => {
    const version = (await as('admin').get('/versions/2').expect(200)).body.data;
    expect(version).toMatchObject({ version: 2, status: 'SUPERSEDED', contentSq: doc(heading('Hapja'), bullets('Përshëndetni klientin me emër.')) });
    await as('admin').get('/versions/999').expect(404);
  });

  it('FR-SCR-06 restoring version 2 creates a draft with version 2\'s text, and publishing it makes it current again', async () => {
    const latest = (await as('admin').get('/versions').expect(200)).body.data.versions[0].version;
    const draft = (await as('admin').post('/versions/2/restore').expect(200)).body.data;
    expect(draft).toMatchObject({
      version: latest + 1,
      status: 'DRAFT',
      contentSq: doc(heading('Hapja'), bullets('Përshëndetni klientin me emër.')),
      contentEn: doc(heading('Opening')),
    });
    expect((await published()).version).toBe(latest);

    // Restoring again replaces the same draft rather than adding another.
    const again = (await as('admin').post('/versions/1/restore').expect(200)).body.data;
    expect(again).toMatchObject({ version: latest + 1, contentSq: DEFAULT_SALES_SCRIPT.contentSq });
    await as('admin').post('/versions/999/restore').expect(404);

    await publish().expect(200);
    expect((await published()).content).toEqual(DEFAULT_SALES_SCRIPT.contentSq);
  });

  it('FR-SCR-07 salespeople can only read the script; Reception cannot read it', async () => {
    for (const who of ['sales', 'manager'] as const) {
      await as(who).get('').expect(200);
      await as(who).get('/draft').expect(403);
      await as(who).put('/draft', { contentSq: doc(bullets('X')), contentEn: null }).expect(403);
      await as(who).post('/publish').expect(403);
      await as(who).get('/versions').expect(403);
      await as(who).get('/versions/1').expect(403);
      await as(who).post('/versions/1/restore').expect(403);
    }
    await as('reception').get('').expect(403);
    expect(await prisma.salesScript.count({ where: { tenantId, status: 'DRAFT' } })).toBe(0);
  });

  it('NFR-SEC-05 a script tag and a javascript: link are stripped before the script is stored', async () => {
    const pasted = await saveDraft('<h2>Hapja</h2><p>Mirëdita<script>alert(1)</script></p>').expect(200);
    expect(JSON.stringify(pasted.body.data.contentSq)).not.toContain('alert');
    expect(pasted.body.data.contentSq).toEqual(doc({ type: 'paragraph', content: [text('Hapja')] }, { type: 'paragraph', content: [text('Mirëdita')] }));

    const linked = await saveDraft(
      doc({ type: 'paragraph', content: [text('Kliko', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] }),
      doc({ type: 'paragraph', content: [text('Site', [{ type: 'link', attrs: { href: 'https://wellness.al' } }])] })
    ).expect(200);
    expect(linked.body.data.contentSq).toEqual(doc({ type: 'paragraph', content: [text('Kliko')] }));
    expect(linked.body.data.contentEn).toEqual(doc({ type: 'paragraph', content: [text('Site', [{ type: 'link', attrs: { href: 'https://wellness.al' } }])] }));

    const stored = await prisma.salesScript.findFirstOrThrow({ where: { tenantId, status: 'DRAFT' } });
    expect(JSON.stringify(stored)).not.toMatch(/script>|javascript:/);

    const refused = await saveDraft(doc({ type: 'image', attrs: { src: 'x' } })).expect(400);
    expect(refused.body).toMatchObject({ code: 'INVALID_RICH_TEXT', field: 'contentSq' });
  });

  it('FR-SCR-05 FR-AUD-09 a failed audit write rolls the publish back', async () => {
    const failing = createApp({
      salesScriptWriteTransaction: new PrismaSalesScriptWriteTransaction(prisma, () => ({
        record: async () => {
          throw new Error('audit down');
        },
      })),
    });
    const before = await published();
    await saveDraft(doc(bullets('Nuk publikohet.'))).expect(200);
    await request(failing).post(`/api/${slug}/sales-script/publish`).set('Authorization', `Bearer ${tokens.admin}`).expect(500);
    expect(await published()).toEqual(before);
    expect(await prisma.salesScript.count({ where: { tenantId, status: 'DRAFT' } })).toBe(1);
  });

  it('the database keeps one draft and one published version per workspace', async () => {
    const latest = await prisma.salesScript.aggregate({ where: { tenantId }, _max: { version: true } });
    await expect(
      prisma.salesScript.create({
        data: {
          id: randomUUID(),
          tenantId,
          version: (latest._max.version ?? 0) + 1,
          status: 'PUBLISHED',
          liveSlot: 'PUBLISHED',
          contentSq: doc(bullets('Second')),
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('never reaches another workspace\'s script', async () => {
    const otherTenantId = `t-sales-script-other-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'Other', urlSlug: otherTenantId } });
    try {
      await new PrismaSalesScriptSeeder(prisma).seed(otherTenantId);
      await prisma.salesScript.updateMany({
        where: { tenantId: otherTenantId },
        data: { contentSq: doc(bullets('Sekret i tjetrit.')) },
      });
      expect(JSON.stringify(await published())).not.toContain('Sekret');
      expect(JSON.stringify((await as('admin').get('/versions').expect(200)).body)).not.toContain('Sekret');
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(otherTenantId);
    }
  });
});
