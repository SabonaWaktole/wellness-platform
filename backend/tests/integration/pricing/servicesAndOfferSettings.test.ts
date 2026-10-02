import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaPricingWriteTransaction } from '../../../src/pricing/infrastructure/PrismaPricingWriteTransaction';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { DEFAULT_OFFER_TEXTS, DEFAULT_SERVICES } from '../../../src/pricing/domain/DefaultOfferSettings';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/**
 * M2 Slice 4 end to end (FR-PCF-06, FR-PCF-08, NFR-SEC-05, FR-AUD-09): the
 * Administrator manages the services and packages the offer describes and the
 * offer settings, from Settings → Pricing. Every write is one audit entry in
 * the same transaction, and offer texts are sanitised before they are stored.
 */
describe('Services, packages and offer settings (FR-PCF-06, FR-PCF-08)', () => {
  const tenantId = `t-offer-settings-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-offer-settings-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), reception: uid('reception'), sales: uid('sales') };
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}/pricing${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}/pricing${path}`)).send(body),
      patch: (path: string, body: object) => auth(request(app).patch(`/api/${slug}/pricing${path}`)).send(body),
      put: (path: string, body: object) => auth(request(app).put(`/api/${slug}/pricing${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}/pricing${path}`)),
    };
  };

  const config = async () => (await as('admin').get('/config').expect(200)).body.data;
  const auditCount = () => prisma.auditEntry.count({ where: { tenantId } });
  const latestAudit = () => prisma.auditEntry.findFirstOrThrow({ where: { tenantId }, orderBy: { at: 'desc' } });
  const createService = async (nameSq: string) =>
    (await as('admin').post('/services', { nameSq, nameEn: `${nameSq} (en)`, descriptionSq: `Për ${nameSq}` }).expect(201)).body.item;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Offer settings tenant', urlSlug: slug } });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);

    const user = (id: string, roleId: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator]),
        user(users.reception, roles[RoleKey.Reception]),
        user(users.sales, roles[RoleKey.SalesUser]),
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

  it('FR-PCF-06 FR-PCF-08 a new workspace starts with the placeholder services, the default Standard package and the offer defaults', async () => {
    const data = await config();
    expect(data.services.map((s: any) => s.nameEn)).toEqual(DEFAULT_SERVICES.map((s) => s.nameEn));
    expect(data.packages).toHaveLength(1);
    expect(data.packages[0]).toMatchObject({ nameEn: 'Standard', isDefault: true, active: true });
    expect(data.packages[0].serviceIds).toEqual(data.services.map((s: any) => s.id));
    expect(data.offerSettings).toMatchObject({
      offerValidityDays: 30,
      contractMonthsDefault: 12,
      offerNumberPrefix: 'OF',
      companyName: 'Offer settings tenant',
      termsEn: DEFAULT_OFFER_TEXTS.termsEn,
      termsSq: DEFAULT_OFFER_TEXTS.termsSq,
    });
  });

  it('FR-PCF-06 a package with three services returns them in order, for the settings screen and for an offer', async () => {
    const [a, b, c] = [await createService('Shërbim A'), await createService('Shërbim B'), await createService('Shërbim C')];
    const { body } = await as('admin')
      .post('/packages', { nameSq: 'Paketa Plus', nameEn: 'Plus package', descriptionEn: 'More', serviceIds: [c.id, a.id, b.id] })
      .expect(201);
    expect(body.item).toMatchObject({ nameEn: 'Plus package', serviceIds: [c.id, a.id, b.id], isDefault: false });

    const plus = (await config()).packages.find((p: any) => p.id === body.item.id);
    expect(plus.serviceIds).toEqual([c.id, a.id, b.id]);

    const active = (await as('sales').get('/packages/active').expect(200)).body.data;
    expect(active[0].nameEn).toBe('Standard');
    const offered = active.find((p: any) => p.id === body.item.id);
    expect(offered.services.map((s: any) => s.nameSq)).toEqual(['Shërbim C', 'Shërbim A', 'Shërbim B']);
    expect(offered.services[0]).toEqual({
      id: c.id,
      nameSq: 'Shërbim C',
      nameEn: 'Shërbim C (en)',
      descriptionSq: 'Për Shërbim C',
      descriptionEn: null,
    });

    await as('admin').put(`/packages/${body.item.id}/services`, { serviceIds: [a.id, b.id] }).expect(200);
    expect((await config()).packages.find((p: any) => p.id === body.item.id).serviceIds).toEqual([a.id, b.id]);
  });

  it('FR-PCF-06 a package with no active service is refused', async () => {
    const lone = await createService('Shërbim i vetëm');
    expect((await as('admin').post('/packages', { nameSq: 'Bosh', serviceIds: [] }).expect(400)).body.code).toBe('PACKAGE_NEEDS_SERVICE');

    await as('admin').post(`/services/${lone.id}/deactivate`).expect(200);
    expect((await as('admin').post('/packages', { nameSq: 'Joaktive', serviceIds: [lone.id] }).expect(400)).body.code).toBe(
      'SERVICE_NOT_ACTIVE'
    );
    expect((await as('admin').post('/packages', { nameSq: 'Dyfish', serviceIds: [lone.id, lone.id] }).expect(400)).body.field).toBe(
      'serviceIds'
    );
    await as('admin').post(`/services/${lone.id}/reactivate`).expect(200);

    const pkg = (await as('admin').post('/packages', { nameSq: 'Vetëm një', serviceIds: [lone.id] }).expect(201)).body.item;
    expect((await as('admin').put(`/packages/${pkg.id}/services`, { serviceIds: [] }).expect(400)).body.code).toBe('PACKAGE_NEEDS_SERVICE');

    // Deactivating the only active service of an active package is refused, naming the package.
    const refused = (await as('admin').post(`/services/${lone.id}/deactivate`).expect(409)).body;
    expect(refused).toMatchObject({ code: 'SERVICE_LAST_IN_PACKAGE', names: ['Vetëm një'] });
    // Once the package is inactive the service may go; the package then cannot come back without one.
    await as('admin').post(`/packages/${pkg.id}/deactivate`).expect(200);
    await as('admin').post(`/services/${lone.id}/deactivate`).expect(200);
    expect((await as('admin').post(`/packages/${pkg.id}/reactivate`).expect(409)).body.code).toBe('SERVICE_LAST_IN_PACKAGE');
  });

  it('FR-PCF-06 exactly one package is the default, and it cannot be deactivated or deleted', async () => {
    const service = await createService('Për paracaktim');
    const standard = (await config()).packages.find((p: any) => p.nameEn === 'Standard');
    const other = (await as('admin').post('/packages', { nameSq: 'Tjetër', serviceIds: [service.id] }).expect(201)).body.item;

    expect((await as('admin').post(`/packages/${standard.id}/deactivate`).expect(409)).body.code).toBe('DEFAULT_PACKAGE_REQUIRED');
    expect((await as('admin').delete(`/packages/${standard.id}`).expect(409)).body.code).toBe('DEFAULT_PACKAGE_REQUIRED');

    await as('admin').post(`/packages/${other.id}/default`).expect(200);
    const defaults = (await config()).packages.filter((p: any) => p.isDefault);
    expect(defaults.map((p: any) => p.id)).toEqual([other.id]);
    expect((await as('sales').get('/packages/active').expect(200)).body.data[0].id).toBe(other.id);

    // The old default can now go, and the new one is still the only default.
    await as('admin').post(`/packages/${standard.id}/deactivate`).expect(200);
    expect((await as('admin').post(`/packages/${standard.id}/default`).expect(409)).body.code).toBe('DEFAULT_PACKAGE_REQUIRED');
    await as('admin').post(`/packages/${standard.id}/reactivate`).expect(200);
    await as('admin').post(`/packages/${standard.id}/default`).expect(200);
    expect((await config()).packages.filter((p: any) => p.isDefault).map((p: any) => p.id)).toEqual([standard.id]);
  });

  it('FR-PCF-06 a service in a package is in use: it can be deactivated, not deleted', async () => {
    const service = await createService('Në përdorim');
    const extra = await createService('Shtesë');
    await as('admin').post('/packages', { nameSq: 'Me shërbimin', serviceIds: [service.id, extra.id] }).expect(201);

    const refused = (await as('admin').delete(`/services/${service.id}`).expect(409)).body;
    expect(refused).toMatchObject({ code: 'PRICING_ITEM_IN_USE', names: ['Me shërbimin'] });
    await as('admin').post(`/services/${service.id}/deactivate`).expect(200);
    expect(await prisma.service.count({ where: { id: service.id } })).toBe(1);

    const unused = await createService('E papërdorur');
    await as('admin').delete(`/services/${unused.id}`).expect(204);
    expect(await prisma.service.count({ where: { id: unused.id } })).toBe(0);
  });

  it('FR-PCF-06 service and package names are unique and descriptions are bounded', async () => {
    await createService('Unik');
    expect((await as('admin').post('/services', { nameSq: 'unik' }).expect(409)).body.code).toBe('PRICING_VALUE_TAKEN');
    expect((await as('admin').post('/services', { nameSq: 'Gjatë', descriptionSq: 'x'.repeat(2001) }).expect(400)).body.field).toBe(
      'descriptionSq'
    );
  });

  it('FR-PCF-08 changing the validity from 30 to 15 days is stored and audited with old and new values', async () => {
    const before = await auditCount();
    const { body } = await as('admin').put('/offer-settings', { offerValidityDays: 15 }).expect(200);
    expect(body.data.offerValidityDays).toBe(15);
    expect((await config()).offerSettings.offerValidityDays).toBe(15);
    expect(await auditCount()).toBe(before + 1);
    expect(await latestAudit()).toMatchObject({
      entityType: 'PricingSettings',
      entityId: tenantId,
      action: 'UPDATE',
      changes: [{ field: 'offerValidityDays', old: 30, new: 15 }],
    });

    // Sending the same value again writes nothing.
    await as('admin').put('/offer-settings', { offerValidityDays: 15 }).expect(200);
    expect(await auditCount()).toBe(before + 1);
  });

  it('FR-PCF-08 sets the company details and the texts, each change in one audit entry', async () => {
    const before = await auditCount();
    await as('admin')
      .put('/offer-settings', {
        companyName: 'Wellness Albania sh.p.k.',
        nipt: 'L12345678A',
        email: 'info@wellness.al',
        website: 'wellness.al',
        bankDetails: 'Raiffeisen Bank\nIBAN AL00 0000 0000',
        offerNumberPrefix: 'WA',
        introEn: { type: 'doc', content: [paragraph('Dear client,')] },
      })
      .expect(200);
    expect(await auditCount()).toBe(before + 1);
    const entry = await latestAudit();
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'companyName', old: 'Offer settings tenant', new: 'Wellness Albania sh.p.k.' },
        { field: 'offerNumberPrefix', old: 'OF', new: 'WA' },
        { field: 'introEn', old: 'Thank you for your interest. Below is our offer for health and safety services at work.', new: 'Dear client,' },
      ])
    );
    expect((await config()).offerSettings).toMatchObject({
      nipt: 'L12345678A',
      bankDetails: 'Raiffeisen Bank\nIBAN AL00 0000 0000',
      introEn: { type: 'doc', content: [paragraph('Dear client,')] },
    });
  });

  it.each([
    [{ offerValidityDays: 0 }, 'offerValidityDays'],
    [{ offerValidityDays: 366 }, 'offerValidityDays'],
    [{ contractMonthsDefault: 61 }, 'contractMonthsDefault'],
    [{ offerNumberPrefix: 'of1' }, 'offerNumberPrefix'],
    [{ email: 'nope' }, 'email'],
    [{ termsEn: { type: 'doc', content: [{ type: 'table' }] } }, 'termsEn'],
  ])('FR-PCF-08 refuses %p', async (values, field) => {
    const before = await auditCount();
    const { body } = await as('admin').put('/offer-settings', values).expect(400);
    expect(body.field).toBe(field);
    expect(await auditCount()).toBe(before);
  });

  it('FR-PCF-08 the default contract length is the one the annual value uses', async () => {
    const riskLevelId = (await prisma.riskLevel.findFirstOrThrow({ where: { tenantId, level: 2 } })).id;
    const frequencyId = (await prisma.visitFrequency.findFirstOrThrow({ where: { tenantId, nameSq: '2 herë në vit' } })).id;
    const zoneId = (await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq: 'Tirana qendër' } })).id;
    const exampleA = { employees: 2, riskLevelId, frequencyId, zoneId };

    expect((await as('admin').post('/test-calculation', exampleA).expect(200)).body.result.annualValue).toBe('592.80');
    await as('admin').put('/offer-settings', { contractMonthsDefault: 24 }).expect(200);
    expect((await as('admin').post('/test-calculation', exampleA).expect(200)).body.result.annualValue).toBe('1185.60');
    await as('admin').put('/offer-settings', { contractMonthsDefault: 12 }).expect(200);
  });

  it('NFR-SEC-05 offer terms sent as HTML with a <script> tag and a javascript: link are stored without either', async () => {
    await as('admin')
      .put('/offer-settings', {
        termsEn: '<p>VAT not included.<script>alert(1)</script></p><p><a href="javascript:alert(1)">Read the terms</a></p>',
        termsSq: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Kushtet', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: '_blank' } }] },
                { type: 'text', text: ' dhe ' },
                { type: 'text', text: 'faqja', marks: [{ type: 'link', attrs: { href: 'https://wellness.al', target: '_blank' } }] },
              ],
            },
          ],
        },
      })
      .expect(200);

    const row = await prisma.pricingSettings.findUniqueOrThrow({ where: { tenantId } });
    const stored = JSON.stringify([row.termsEn, row.termsSq]);
    expect(stored).not.toMatch(/script|alert|javascript/i);
    expect(row.termsEn).toEqual({ type: 'doc', content: [paragraph('VAT not included.'), paragraph('Read the terms')] });
    expect(row.termsSq).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Kushtet' },
            { type: 'text', text: ' dhe ' },
            { type: 'text', text: 'faqja', marks: [{ type: 'link', attrs: { href: 'https://wellness.al' } }] },
          ],
        },
      ],
    });

    // Clearing a text stores nothing.
    await as('admin').put('/offer-settings', { closingEn: null }).expect(200);
    expect((await prisma.pricingSettings.findUniqueOrThrow({ where: { tenantId } })).closingEn).toBeNull();
  });

  it('FR-AUD-09 every service and package write is one audit entry in the pricing group', async () => {
    let before = await auditCount();
    const service = await createService('Auditim');
    expect(await auditCount()).toBe(before + 1);
    expect(await latestAudit()).toMatchObject({
      entityType: 'Service',
      action: 'CREATE',
      changes: expect.arrayContaining([{ field: 'nameSq', old: null, new: 'Auditim' }]),
    });

    before = await auditCount();
    const pkg = (await as('admin').post('/packages', { nameSq: 'Auditimi', serviceIds: [service.id] }).expect(201)).body.item;
    expect(await auditCount()).toBe(before + 1);
    expect(await latestAudit()).toMatchObject({
      entityType: 'ServicePackage',
      action: 'CREATE',
      changes: expect.arrayContaining([{ field: 'services', old: null, new: ['Auditim'] }]),
    });

    const second = await createService('Auditim 2');
    before = await auditCount();
    await as('admin').put(`/packages/${pkg.id}/services`, { serviceIds: [second.id, service.id] }).expect(200);
    expect(await auditCount()).toBe(before + 1);
    expect((await latestAudit()).changes).toEqual([{ field: 'services', old: ['Auditim'], new: ['Auditim 2', 'Auditim'] }]);

    before = await auditCount();
    await as('admin').patch(`/services/${service.id}`, { descriptionEn: 'Audited' }).expect(200);
    expect((await latestAudit()).changes).toEqual([{ field: 'descriptionEn', old: null, new: 'Audited' }]);
    expect(await auditCount()).toBe(before + 1);

    const grouped = await request(app)
      .get(`/api/${slug}/audit?entityGroup=pricing&limit=100`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const types = new Set(grouped.body.data.map((entry: any) => entry.entityType));
    expect([...types]).toEqual(expect.arrayContaining(['Service', 'ServicePackage', 'PricingSettings']));
  });

  it('FR-AUD-09 a failed audit write rolls the offer settings and package changes back', async () => {
    const failing = createApp({
      pricingWriteTransaction: new PrismaPricingWriteTransaction(prisma, () => ({
        record: async () => {
          throw new Error('audit down');
        },
      })),
    });
    const send = (method: 'put' | 'post', path: string, body: object = {}) =>
      request(failing)[method](`/api/${slug}/pricing${path}`).set('Authorization', `Bearer ${tokens.admin}`).send(body);

    const services = await prisma.service.count({ where: { tenantId } });
    await send('put', '/offer-settings', { offerValidityDays: 45 }).expect(500);
    await send('post', '/services', { nameSq: 'Nuk ruhet' }).expect(500);
    expect((await config()).offerSettings.offerValidityDays).toBe(15);
    expect(await prisma.service.count({ where: { tenantId } })).toBe(services);
  });

  it('NFR-SEC-04 Reception and Sales User may not change services, packages or offer settings; a salesperson reads the active packages', async () => {
    const standard = (await config()).packages.find((p: any) => p.nameEn === 'Standard');
    const service = (await config()).services[0];
    for (const who of ['reception', 'sales'] as const) {
      await as(who).post('/services', { nameSq: 'X' }).expect(403);
      await as(who).patch(`/services/${service.id}`, { nameSq: 'X' }).expect(403);
      await as(who).post('/packages', { nameSq: 'X', serviceIds: [service.id] }).expect(403);
      await as(who).put(`/packages/${standard.id}/services`, { serviceIds: [service.id] }).expect(403);
      await as(who).post(`/packages/${standard.id}/default`).expect(403);
      await as(who).put('/offer-settings', { offerValidityDays: 1 }).expect(403);
    }
    await as('reception').get('/packages/active').expect(403);
    const active = (await as('sales').get('/packages/active').expect(200)).body.data;
    expect(active.length).toBeGreaterThan(0);
    expect((await config()).offerSettings.offerValidityDays).toBe(15);
  });

  it('never reaches another workspace\'s service or package', async () => {
    const otherTenantId = `t-offer-other-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'Other', urlSlug: otherTenantId } });
    try {
      await new PrismaLookupSeeder(prisma).seed(otherTenantId);
      await new PrismaPricingSeeder(prisma).seed(otherTenantId);
      const otherService = await prisma.service.findFirstOrThrow({ where: { tenantId: otherTenantId } });
      const otherPackage = await prisma.servicePackage.findFirstOrThrow({ where: { tenantId: otherTenantId } });

      await as('admin').patch(`/services/${otherService.id}`, { nameSq: 'Hacked' }).expect(404);
      await as('admin').put(`/packages/${otherPackage.id}/services`, { serviceIds: [] }).expect(404);
      await as('admin').post(`/packages/${otherPackage.id}/default`).expect(404);
      const standard = (await config()).packages.find((p: any) => p.nameEn === 'Standard');
      expect((await as('admin').put(`/packages/${standard.id}/services`, { serviceIds: [otherService.id] }).expect(400)).body.code).toBe(
        'SERVICE_NOT_ACTIVE'
      );
      expect((await prisma.service.findUniqueOrThrow({ where: { id: otherService.id } })).nameSq).not.toBe('Hacked');
      expect(await prisma.packageService.count({ where: { packageId: otherPackage.id } })).toBe(DEFAULT_SERVICES.length);
    } finally {
      await new PrismaTenantDeletionTransaction(prisma).run(otherTenantId);
    }
  });
});
