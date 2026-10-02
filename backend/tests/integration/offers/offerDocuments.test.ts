import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { PrismaLookupSeeder } from '../../../src/lookups/infrastructure/PrismaLookupSeeder';
import { PrismaPricingSeeder } from '../../../src/pricing/infrastructure/PrismaPricingSeeder';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { PrismaNotificationSettingsRepository } from '../../../src/notifications/infrastructure/PrismaNotificationSettingsRepository';
import { QuotationExpiryJob } from '../../../src/scheduler/jobs/QuotationExpiryJob';
import { ExpireOfferUseCase } from '../../../src/quotations/application/offers/ExpireOfferUseCase';
import { ExpireQuotationUseCase } from '../../../src/quotations/application/use-cases/ExpireQuotationUseCase';
import { PrismaOfferWriteTransaction } from '../../../src/quotations/infrastructure/offers/PrismaOfferWriteTransaction';
import { dayKeyInZone } from '../../../src/shared/domain/time/tenantDay';
import { seedSystemRoles } from '../../support/seedRoles';
import { expectNoCommercialFields } from '../../support/expectNoCommercialFields';

// pdf-parse's index runs a self-test when loaded without a parent; the library file does not.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (data: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();
const TIME_ZONE = 'Europe/Tirane';

/** Collects a binary response body (supertest only buffers text and JSON by default). */
const binary = (res: NodeJS.ReadableStream & { setEncoding?: unknown }, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

/** YYYY-MM-DD plus whole days. */
const plusDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * M2 Slice 9 end to end: offers are numbered per year (FR-OFR-08), made
 * ready, previewed and downloaded as a branded sq/en PDF (FR-OFR-02, 05, 06,
 * 09), marked as sent with their validity (FR-OFR-10) and the deal's move to
 * Offer Sent (FR-DEAL-08), answered (FR-OFR-12), revised into versions
 * (FR-OFR-11), expired by the scheduler (FR-OFR-13), listed within scope
 * (FR-OFR-14) and recorded in history and audit (FR-OFR-15). The workspace
 * runs the sales process (D6), so there is no public link and no email
 * (FR-OFR-07, FR-RBAC-18).
 */
describe('Offer documents (M2 Slice 9)', () => {
  const tenantId = `t-offerdoc-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-od-${label}-${randomUUID()}`;
  const users = {
    admin: uid('admin'),
    salesA: uid('salesA'),
    salesB: uid('salesB'),
    manager: uid('manager'),
    reception: uid('reception'),
  };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens: Record<Who, string> = {} as any;

  const as = (who: Who) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string, body: object = {}) => auth(request(app).post(`/api/${slug}${path}`)).send(body),
      put: (path: string, body: object = {}) => auth(request(app).put(`/api/${slug}${path}`)).send(body),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  const companies = { blloku: randomUUID(), other: randomUUID() };
  const contacts = { primary: randomUUID(), chosen: randomUUID() };
  const today = () => dayKeyInZone(new Date(), TIME_ZONE);
  const year = () => today().slice(0, 4);

  const businessTypeId = async (nameSq: string) => (await prisma.businessType.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const frequencyId = async (nameSq: string) => (await prisma.visitFrequency.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const zoneId = async (nameSq: string) => (await prisma.priceZone.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const cityId = async (nameSq: string) => (await prisma.city.findFirstOrThrow({ where: { tenantId, nameSq } })).id;
  const defaultPackage = async () => (await prisma.servicePackage.findFirstOrThrow({ where: { tenantId, isDefault: true } })).id;

  /** Example A of the SRS: 2 employees, Restaurant (Medium), 2 visits a year, Tirana centre. */
  const exampleA = async (overrides: object = {}) => ({
    employees: 2,
    businessTypeId: await businessTypeId('Restorant'),
    zoneId: await zoneId('Tirana qendër'),
    frequencyId: await frequencyId('2 herë në vit'),
    packageId: await defaultPackage(),
    ...overrides,
  });

  const newDeal = async (clientId = companies.blloku, who: Who = 'salesA') => {
    const res = await as(who).post('/deals', { clientId, type: 'NEW_CONTRACT' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };
  const saveOffer = (who: Who, dealId: string, body: object) => as(who).put(`/deals/${dealId}/offer`, body);
  /** A deal with a priced draft offer; returns the deal and the offer. */
  const pricedDraft = async (who: Who = 'salesA', clientId = companies.blloku, overrides: object = {}) => {
    const dealId = await newDeal(clientId, who);
    const res = await saveOffer(who, dealId, await exampleA(overrides));
    expect(res.status).toBe(201);
    return { dealId, offer: res.body.data };
  };
  const readyOffer = async (who: Who = 'salesA') => {
    const { dealId, offer } = await pricedDraft(who);
    const res = await as(who).post(`/offers/${offer.id}/mark-ready`);
    expect(res.status).toBe(200);
    return { dealId, offer: res.body.data };
  };
  const sentOffer = async (who: Who = 'salesA') => {
    const { dealId, offer } = await readyOffer(who);
    const res = await as(who).post(`/offers/${offer.id}/mark-sent`, { sentDate: today() });
    expect(res.status).toBe(200);
    return { dealId, offer: res.body.data };
  };
  const pdf = (who: Who, offerId: string, query = '') =>
    as(who).get(`/offers/${offerId}/pdf${query}`).buffer(true).parse(binary as any);
  const pdfText = async (who: Who, offerId: string, query = '') => {
    const res = await pdf(who, offerId, query);
    expect(res.status).toBe(200);
    return (await pdfParse(res.body as Buffer)).text;
  };
  const dealOf = async (dealId: string) => (await as('salesA').get(`/deals/${dealId}`).expect(200)).body.data;

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Offer documents tenant', urlSlug: slug, salesWorkflow: 'SALES_PROCESS', defaultLanguage: 'sq', timezone: TIME_ZONE },
    });
    const roles = await seedSystemRoles(prisma, tenantId);
    await new PrismaLookupSeeder(prisma).seed(tenantId);
    await new PrismaPricingSeeder(prisma).seed(tenantId);

    const user = (id: string, roleId: string, firstName: string, phone: string | null = null) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test', phone,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.salesA, roles[RoleKey.SalesUser], 'Besa', '+355 67 222 2222'),
        user(users.salesB, roles[RoleKey.SalesUser], 'Dritan'),
        user(users.manager, roles[RoleKey.SalesManager], 'Erion'),
        user(users.reception, roles[RoleKey.Reception], 'Fatos'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    const restaurant = await businessTypeId('Restorant');
    const area = await prisma.area.findFirst({ where: { tenantId } });
    await prisma.client.createMany({
      data: [
        {
          id: companies.blloku, tenantId, name: 'Kafe Blloku', assignedUserId: users.salesA, customFieldValues: {}, lastUpdatedByUserId: users.admin,
          employeeCount: 2, businessTypeId: restaurant, cityId: await cityId('Tiranë'), areaId: area?.id ?? null,
          taxId: 'K98765432B', streetAddress: 'Rruga Pjetër Bogdani 5',
        },
        {
          id: companies.other, tenantId, name: 'Restorant B', assignedUserId: users.salesB, customFieldValues: {}, lastUpdatedByUserId: users.admin,
          employeeCount: 2, businessTypeId: restaurant, cityId: await cityId('Tiranë'),
        },
      ],
    });
    await prisma.contactPerson.createMany({
      data: [
        { id: contacts.primary, tenantId, clientId: companies.blloku, name: 'Elira Hoxha', position: 'Administratore', isPrimary: true },
        { id: contacts.chosen, tenantId, clientId: companies.blloku, name: 'Gëzim Çela', position: 'Menaxher', isPrimary: false },
      ],
    });
    await as('admin')
      .put('/pricing/offer-settings', {
        companyName: 'Wellness Albania',
        nipt: 'L12345678A',
        address: 'Rruga e Kavajës, Tiranë',
        phone: '+355 69 000 0000',
        email: 'info@wellness.al',
        bankDetails: 'IBAN AL00 0000',
        introSq: doc('Faleminderit për interesin tuaj.'),
        introEn: doc('Thank you for your interest.'),
        termsSq: doc('Kushtet e kontratës.'),
        termsEn: doc('Contract terms.'),
      })
      .expect(200);
  }, 30_000);

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('numbering (FR-OFR-08)', () => {
    it('FR-OFR-08 two offers created one after the other get consecutive numbers', async () => {
      const first = (await pricedDraft()).offer;
      const second = (await pricedDraft()).offer;
      expect(first.number).toMatch(new RegExp(`^OF-${year()}-\\d{4}$`));
      expect(Number(second.number.slice(-4))).toBe(Number(first.number.slice(-4)) + 1);
      expect(first).toMatchObject({ version: 1, reference: first.number });
    });

    it("FR-OFR-08 a deleted draft's number is never reused", async () => {
      const deleted = (await pricedDraft()).offer;
      await prisma.quotation.delete({ where: { id: deleted.id } });
      const next = (await pricedDraft()).offer;
      expect(next.number).not.toBe(deleted.number);
      expect(Number(next.number.slice(-4))).toBe(Number(deleted.number.slice(-4)) + 1);
    });

    it('FR-OFR-08 two offers created at the same time never share a number', async () => {
      const [dealA, dealB] = [await newDeal(), await newDeal()];
      const body = await exampleA();
      const [a, b] = await Promise.all([saveOffer('salesA', dealA, body), saveOffer('salesA', dealB, body)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.data.number).not.toBe(b.body.data.number);
    });

    it('FR-OFR-08 saving the pricing screen again keeps the offer and its number', async () => {
      const { dealId, offer } = await pricedDraft();
      const again = await saveOffer('salesA', dealId, await exampleA({ employees: 3 })).expect(200);
      expect(again.body.data).toMatchObject({ id: offer.id, number: offer.number });
    });
  });

  describe('ready and the document (FR-OFR-02, 05, 06, 09)', () => {
    it('FR-OFR-09 a priced draft becomes Ready, and can then be marked as sent', async () => {
      const { offer } = await readyOffer();
      expect(offer).toMatchObject({ status: 'READY', permittedActions: ['EDIT', 'MARK_SENT'] });
      expect(offer.readyAt).toEqual(expect.any(String));
    });

    it('FR-OFR-09 FR-PRC-07 a "Price on request" draft cannot be made ready', async () => {
      const company = randomUUID();
      await prisma.client.create({
        data: {
          id: company, tenantId, name: 'Kafe e madhe', assignedUserId: users.salesA, customFieldValues: {}, lastUpdatedByUserId: users.admin,
          employeeCount: 40, businessTypeId: await businessTypeId('Restorant'), cityId: await cityId('Tiranë'),
        },
      });
      const { offer } = await pricedDraft('salesA', company, { employees: 40 });
      expect(offer.listPrice).toBeNull();
      const res = await as('salesA').post(`/offers/${offer.id}/mark-ready`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'OFFER_NOT_READY', reason: 'NO_PRICE' });
    });

    it('FR-OFR-02 the PDF carries every field, with the company, contact, salesperson and Wellness Albania details', async () => {
      const { offer } = await readyOffer();
      const text = await pdfText('salesA', offer.id);
      for (const expected of [
        `Ofertë ${offer.number}`,
        'Wellness Albania',
        'L12345678A',
        'Kafe Blloku',
        'K98765432B',
        'Rruga Pjetër Bogdani 5',
        'Tiranë',
        'Elira Hoxha, Administratore',
        'Restorant',
        'Tirana qendër',
        '2 herë në vit',
        '49,40',
        '592,80',
        'Çmimet nuk përfshijnë TVSH-në.',
        'Faleminderit për interesin tuaj.',
        'Kushtet e kontratës.',
        'Besa Test',
        '+355 67 222 2222',
        'IBAN AL00 0000',
      ]) {
        expect(text).toContain(expected);
      }
      // Q13: no "Wellness price per person".
      expect(text).not.toContain('24,70');
    });

    it('FR-OFR-02 the offer is addressed to the contact chosen on the pricing screen', async () => {
      const dealId = await newDeal();
      const saved = await saveOffer('salesA', dealId, { ...(await exampleA()), contactPersonId: contacts.chosen }).expect(201);
      expect(saved.body.data.contactPersonId).toBe(contacts.chosen);
      expect(await pdfText('salesA', saved.body.data.id)).toContain('Gëzim Çela, Menaxher');
    });

    it("FR-OFR-02 a contact of another company is refused", async () => {
      const dealId = await newDeal();
      const res = await saveOffer('salesA', dealId, { ...(await exampleA()), contactPersonId: randomUUID() });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe('contactPersonId');
    });

    it('FR-OFR-05 FR-OFR-06 the preview and the download are the same PDF, named Oferta_<company>_<number>.pdf', async () => {
      const { offer } = await readyOffer();
      const inline = await pdf('salesA', offer.id, '?disposition=inline').expect(200);
      const download = await pdf('salesA', offer.id).expect(200);
      expect(inline.headers['content-type']).toBe('application/pdf');
      expect(inline.headers['content-disposition']).toMatch(new RegExp(`^inline; filename="Oferta_kafe-blloku_${offer.number}.pdf"`));
      expect(download.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="Oferta_kafe-blloku_${offer.number}.pdf"`));
      // The font subset's tag is random per render; everything else is the same.
      const normalise = (body: Buffer) => body.toString('latin1').replace(/\/[A-Z]{6}\+/g, '/SUBSET+');
      expect(normalise(inline.body)).toBe(normalise(download.body));
      expect((inline.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('FR-OFR-06 NFR-I18N-02 the PDF is Albanian by default and English when asked', async () => {
      const { offer } = await readyOffer();
      const sq = await pdfText('salesA', offer.id);
      const en = await pdfText('salesA', offer.id, '?lang=en');
      expect(sq).toContain('Çmimi neto në muaj');
      expect(en).toContain(`Offer ${offer.number}`);
      expect(en).toContain('Net monthly price');
      expect(en).toContain('Thank you for your interest.');
      expect(en).toContain('Prices do not include VAT.');
    });

    it('FR-OFR-09 a draft downloads with the DRAFT watermark; a ready offer without it', async () => {
      const { offer } = await pricedDraft();
      expect(await pdfText('salesA', offer.id)).toContain('DRAFT');
      await as('salesA').post(`/offers/${offer.id}/mark-ready`).expect(200);
      expect(await pdfText('salesA', offer.id)).not.toContain('DRAFT');
    });

    it('FR-OFR-04 a ready offer downloads the same after the surcharge and the texts change (UAT-5 step 3)', async () => {
      const { offer } = await readyOffer();
      const before = await pdfText('salesA', offer.id);
      const medium = await prisma.riskLevel.findFirstOrThrow({ where: { tenantId, level: 2 } });
      const surcharge = await prisma.riskSurcharge.findFirstOrThrow({ where: { tenantId, riskLevelId: medium.id } });
      await as('admin').put(`/pricing/risk-surcharges/${medium.id}`, { riskSurchargePercent: '15.00' }).expect(200);
      await as('admin').put('/pricing/offer-settings', { introSq: doc('Një hyrje e re.'), companyName: 'Wellness Albania sh.p.k.' }).expect(200);
      try {
        const after = await pdfText('salesA', offer.id);
        expect(after).toBe(before);
        expect(after).toContain('49,40');
        expect(after).not.toContain('Një hyrje e re.');
      } finally {
        await as('admin').put(`/pricing/risk-surcharges/${medium.id}`, { riskSurchargePercent: surcharge.percent.toFixed(2) }).expect(200);
        await as('admin')
          .put('/pricing/offer-settings', { introSq: doc('Faleminderit për interesin tuaj.'), companyName: 'Wellness Albania' })
          .expect(200);
      }
    });

    it('NFR-PERF-02 an offer PDF is generated in under 3 seconds', async () => {
      const { offer } = await readyOffer();
      const started = Date.now();
      await pdf('salesA', offer.id).expect(200);
      expect(Date.now() - started).toBeLessThan(3000);
    });
  });

  describe('sending and answering (FR-OFR-10, 12, 15, FR-DEAL-08)', () => {
    it('FR-OFR-10 marking as sent sets the status Sent and the validity date = sent date + 30 days', async () => {
      const { offer } = await sentOffer();
      expect(offer).toMatchObject({ status: 'SENT', validUntil: plusDays(today(), 30) });
      expect(offer.permittedActions).toEqual(['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE']);
      expect(await pdfText('salesA', offer.id)).toContain('E vlefshme deri më');
    });

    it('FR-OFR-10 the date sent cannot be in the future', async () => {
      const { offer } = await readyOffer();
      const res = await as('salesA').post(`/offers/${offer.id}/mark-sent`, { sentDate: plusDays(today(), 2) });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_SENT_DATE', field: 'sentDate' });
    });

    it('FR-OFR-09 only a ready offer can be marked as sent', async () => {
      const { offer } = await pricedDraft();
      const res = await as('salesA').post(`/offers/${offer.id}/mark-sent`, { sentDate: today() });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('OFFER_INVALID_TRANSITION');
    });

    it('FR-PCF-08 with a validity of 15 days, the validity date is 15 days after the date sent', async () => {
      await as('admin').put('/pricing/offer-settings', { offerValidityDays: 15 }).expect(200);
      try {
        const { offer } = await sentOffer();
        expect(offer.validUntil).toBe(plusDays(today(), 15));
      } finally {
        await as('admin').put('/pricing/offer-settings', { offerValidityDays: 30 }).expect(200);
      }
    });

    it('FR-DEAL-08 marking as sent moves the deal from Interested to Offer Sent', async () => {
      const { dealId, offer } = await readyOffer();
      await prisma.deal.update({ where: { id: dealId }, data: { stageKey: 'INTERESTED' } });
      await as('salesA').post(`/offers/${offer.id}/mark-sent`, { sentDate: today() }).expect(200);
      expect((await dealOf(dealId)).stage).toBe('OFFER_SENT');
    });

    it('FR-DEAL-08 a deal in Negotiation stays there when its offer is marked as sent', async () => {
      const { dealId, offer } = await readyOffer();
      await prisma.deal.update({ where: { id: dealId }, data: { stageKey: 'NEGOTIATION' } });
      await as('salesA').post(`/offers/${offer.id}/mark-sent`, { sentDate: today() }).expect(200);
      expect((await dealOf(dealId)).stage).toBe('NEGOTIATION');
    });

    it('FR-OFR-15 FR-AUD-09 marking as sent writes a history row and an Offer audit entry with the final prices', async () => {
      const { offer } = await sentOffer();
      const history = await prisma.quotationStatusHistory.findMany({ where: { quotationId: offer.id }, orderBy: { createdAt: 'asc' } });
      expect(history.map((row) => [row.fromStatus, row.toStatus])).toEqual([
        ['NONE', 'DRAFT'],
        ['DRAFT', 'READY'],
        ['READY', 'SENT'],
      ]);
      expect(history[2].changedByUserId).toBe(users.salesA);
      const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Offer', entityId: offer.id, action: 'STATUS_CHANGE' } });
      expect(entries).toHaveLength(2);
      const audit = entries.find((entry) => (entry.changes as any[]).some((change) => change.field === 'status' && change.new === 'SENT'))!;
      expect(audit.userId).toBe(users.salesA);
      expect(audit.entityLabel).toBe(`${offer.number} — Kafe Blloku`);
      expect(audit.changes).toEqual(
        expect.arrayContaining([
          { field: 'status', old: 'READY', new: 'SENT' },
          { field: 'number', old: offer.number, new: offer.number },
          { field: 'version', old: 1, new: 1 },
          { field: 'listPrice', old: '49.40', new: '49.40' },
          { field: 'discountPercent', old: '0.00', new: '0.00' },
          { field: 'netMonthlyPrice', old: '49.40', new: '49.40' },
        ])
      );
    });

    it('FR-OFR-12 a sent offer is marked rejected with a note, kept in its history', async () => {
      const { offer } = await sentOffer();
      const res = await as('salesA').post(`/offers/${offer.id}/mark-rejected`, { note: 'Çmimi shumë i lartë' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'REJECTED', statusNote: 'Çmimi shumë i lartë', permittedActions: [] });
      expect(res.body.data.respondedAt).toEqual(expect.any(String));
    });

    it('FR-OFR-12 a sent offer is marked accepted', async () => {
      const { offer } = await sentOffer();
      const res = await as('salesA').post(`/offers/${offer.id}/mark-accepted`).expect(200);
      expect(res.body.data.status).toBe('ACCEPTED');
    });

    it('FR-OFR-12 only a sent offer can be answered', async () => {
      const { offer } = await readyOffer();
      expect((await as('salesA').post(`/offers/${offer.id}/mark-accepted`)).status).toBe(409);
    });
  });

  describe('versions (FR-OFR-11)', () => {
    it('FR-OFR-11 revising a sent offer makes version 2 with the same number; version 1 stays downloadable and read-only', async () => {
      const { dealId, offer } = await sentOffer();
      const res = await as('salesA').post(`/offers/${offer.id}/revise`).expect(201);
      const v2 = res.body.data;
      expect(v2).toMatchObject({
        number: offer.number,
        version: 2,
        reference: `${offer.number} v2`,
        previousVersionId: offer.id,
        status: 'DRAFT',
        netMonthlyPrice: '49.40',
      });
      const [latest, first] = (await as('salesA').get(`/deals/${dealId}/offers`).expect(200)).body.data;
      expect(latest.id).toBe(v2.id);
      expect(first).toMatchObject({ id: offer.id, status: 'SENT', superseded: true, permittedActions: [] });

      // Version 1 is still downloadable, under its own number.
      const download = await pdf('salesA', offer.id).expect(200);
      expect(download.headers['content-disposition']).toContain(`Oferta_kafe-blloku_${offer.number}.pdf`);
      // Version 2's file says so.
      expect((await pdf('salesA', v2.id).expect(200)).headers['content-disposition']).toContain(`Oferta_kafe-blloku_${offer.number}-v2.pdf`);
      expect(await pdfText('salesA', v2.id)).toContain(`${offer.number} v2`);
    });

    it('FR-OFR-11 only the latest version can be accepted', async () => {
      const { offer } = await sentOffer();
      await as('salesA').post(`/offers/${offer.id}/revise`).expect(201);
      const res = await as('salesA').post(`/offers/${offer.id}/mark-accepted`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('OFFER_NOT_LATEST');
    });

    it('FR-OFR-11 the pricing screen does not overwrite a sent offer; after revising it prices version 2', async () => {
      const { dealId, offer } = await sentOffer();
      const refused = await saveOffer('salesA', dealId, await exampleA({ employees: 3 }));
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('OFFER_REVISE_FIRST');

      const v2 = (await as('salesA').post(`/offers/${offer.id}/revise`).expect(201)).body.data;
      const saved = await saveOffer('salesA', dealId, await exampleA({ employees: 3 })).expect(200);
      expect(saved.body.data).toMatchObject({ id: v2.id, version: 2, employeesPriced: 3 });
      // Version 1 kept its price.
      const v1 = (await as('salesA').get(`/deals/${dealId}/offers`).expect(200)).body.data.find((row: any) => row.id === offer.id);
      expect(v1).toMatchObject({ employeesPriced: 2, netMonthlyPrice: '49.40' });
    });

    it('FR-OFR-04 changing a ready offer from the pricing screen makes it a draft again', async () => {
      const { dealId, offer } = await readyOffer();
      const saved = await saveOffer('salesA', dealId, await exampleA({ employees: 3 })).expect(200);
      expect(saved.body.data).toMatchObject({ id: offer.id, status: 'DRAFT', readyAt: null });
    });
  });

  describe('expiry (FR-OFR-13)', () => {
    it('FR-OFR-13 an offer sent 31 days ago with 30 days validity is expired by the job', async () => {
      const { offer } = await readyOffer();
      // Made long enough ago to have been sent 31 days back.
      await prisma.quotation.update({ where: { id: offer.id }, data: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60_000) } });
      await as('salesA').post(`/offers/${offer.id}/mark-sent`, { sentDate: plusDays(today(), -31) }).expect(200);
      const fresh = (await sentOffer()).offer;

      const job = new QuotationExpiryJob(
        new PrismaSchedulerQueries(prisma),
        new PrismaNotificationSettingsRepository(prisma),
        {} as ExpireQuotationUseCase,
        new ExpireOfferUseCase(new PrismaOfferWriteTransaction(prisma))
      );
      await job.run(new Date());

      const statuses = await prisma.quotation.findMany({ where: { id: { in: [offer.id, fresh.id] } }, select: { id: true, status: true } });
      expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({ [offer.id]: 'EXPIRED', [fresh.id]: 'SENT' });
      const last = await prisma.quotationStatusHistory.findFirstOrThrow({ where: { quotationId: offer.id, toStatus: 'EXPIRED' } });
      expect(last.changedByUserId).toBeNull();
    });
  });

  describe('the offers list (FR-OFR-14, FR-RBAC-17)', () => {
    it("FR-OFR-14 a Sales User lists only their own deals' offers; the Sales Manager sees the team's", async () => {
      const mine = (await pricedDraft('salesA')).offer;
      const theirs = (await pricedDraft('salesB', companies.other)).offer;
      const listOf = async (who: Who, query = '') => ((await as(who).get(`/offers?pageSize=100${query}`).expect(200)).body.data as any[]).map((row) => row.id);

      const forA = await listOf('salesA');
      expect(forA).toContain(mine.id);
      expect(forA).not.toContain(theirs.id);
      const forManager = await listOf('manager');
      expect(forManager).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    });

    it('FR-OFR-14 the list filters by status, salesperson, company and date', async () => {
      const { offer } = await sentOffer();
      const ids = async (query: string) => ((await as('manager').get(`/offers?pageSize=100&${query}`).expect(200)).body.data as any[]).map((row) => row.id);
      expect(await ids('status=SENT')).toContain(offer.id);
      expect(await ids('status=DRAFT')).not.toContain(offer.id);
      expect(await ids(`ownerUserId=${users.salesA}`)).toContain(offer.id);
      expect(await ids(`ownerUserId=${users.salesB}`)).not.toContain(offer.id);
      expect(await ids('q=blloku')).toContain(offer.id);
      expect(await ids(`q=${offer.number}`)).toEqual([offer.id]);
      expect(await ids(`createdFrom=${plusDays(today(), -1)}&createdTo=${plusDays(today(), 1)}`)).toContain(offer.id);
      expect(await ids(`createdTo=${plusDays(today(), -2)}`)).not.toContain(offer.id);
    });

    it('FR-OFR-14 a Sales User cannot download or change another salesperson\'s offer: not found', async () => {
      const theirs = (await pricedDraft('salesB', companies.other)).offer;
      expect((await pdf('salesA', theirs.id)).status).toBe(404);
      expect((await as('salesA').post(`/offers/${theirs.id}/mark-ready`)).status).toBe(404);
    });

    it('FR-RBAC-17 Reception gets 403 on every offer route', async () => {
      const { offer } = await pricedDraft();
      const responses = await Promise.all([
        as('reception').get('/offers'),
        pdf('reception', offer.id),
        as('reception').post(`/offers/${offer.id}/mark-ready`),
        as('reception').post(`/offers/${offer.id}/mark-sent`, { sentDate: today() }),
        as('reception').post(`/offers/${offer.id}/revise`),
      ]);
      expect(responses.map((res) => res.status)).toEqual([403, 403, 403, 403, 403]);
      for (const res of responses) expectNoCommercialFields(res.body);
    });
  });

  describe('the workflow switch (FR-OFR-07, FR-RBAC-18, FR-DEAL-19)', () => {
    it('FR-DEAL-19 a deal with an offer marked as sent cannot be deleted', async () => {
      const { dealId } = await sentOffer();
      const res = await as('admin').delete(`/deals/${dealId}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DEAL_HAS_SENT_OFFER');
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).deletedAt).toBeNull();
    });

    it('FR-DEAL-19 a deal whose offer was only drafted can still be deleted', async () => {
      const { dealId } = await pricedDraft();
      expect((await as('admin').delete(`/deals/${dealId}`)).status).toBe(204);
    });

    it('FR-OFR-07 the public quotation URL returns not found in a sales-process workspace', async () => {
      const token = `tok-${randomUUID()}`;
      await prisma.quotation.create({
        data: { tenantId, clientId: companies.blloku, createdByUserId: users.admin, status: 'SENT', sentAt: new Date(), shareToken: token, number: `LEG-${randomUUID()}` },
      });
      expect((await request(app).get(`/api/public/quotations/${token}`)).status).toBe(404);
      expect((await request(app).get(`/api/public/quotations/${token}/pdf`)).status).toBe(404);
      expect((await request(app).post(`/api/public/quotations/${token}/accept`)).status).toBe(404);
    });

    it('FR-RBAC-18 the legacy submit and approve are refused under the sales process', async () => {
      const id = randomUUID();
      const submit = await as('admin').post(`/quotations/${id}/submit`);
      expect(submit.status).toBe(409);
      expect(submit.body.code).toBe('USE_DEAL_OFFERS');
      expect((await as('admin').post(`/quotations/${id}/approve`)).status).toBe(409);
    });

    it('FR-OFR-15 the company history shows the offer under its reference', async () => {
      const { offer } = await sentOffer();
      const { body } = await as('salesA').get(`/clients/${companies.blloku}/history`).expect(200);
      const entries = (body.timeline as any[]).filter((entry) => entry.details?.quotationId === offer.id);
      expect(entries.map((entry) => entry.type).sort()).toEqual(['QUOTATION_CREATED', 'QUOTATION_STATUS_CHANGED', 'QUOTATION_STATUS_CHANGED', 'QUOTATION_STATUS_CHANGED']);
      expect(entries.every((entry) => entry.details.reference === offer.number)).toBe(true);
      // Reception reads the company, never its offers (FR-RBAC-17).
      const reception = await as('reception').get(`/clients/${companies.blloku}/history`);
      if (reception.status === 200) expect((reception.body.timeline as any[]).some((entry) => entry.category === 'QUOTATION')).toBe(false);
    });
  });
});
