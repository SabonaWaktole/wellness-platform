import request from 'supertest';
import { createApp } from '../../../src/main/app';
import { PrismaClient } from '@prisma/client';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Company profile and localization settings.
 *
 * The endpoint already existed for a single boolean, and carried a bug worth
 * naming: the controller wrote `Boolean(req.body.requiresQuotationApproval)`,
 * so a PUT that did not mention the field coerced `undefined` to `false` and
 * silently turned quotation approval OFF. Several tests below exist to keep
 * that from coming back under a different field name.
 */
describe('Tenant settings', () => {
  let app: any;
  let prisma: PrismaClient;
  let tokenService: JwtTokenService;

  const runId = uuidv4().slice(0, 8);
  const slug = `settings-${runId}`;
  const otherSlug = `settings-other-${runId}`;

  let tenantId: string;
  let otherTenantId: string;
  let ownerToken: string;
  let staffToken: string;
  let otherOwnerToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = createApp();
    tokenService = new JwtTokenService();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    otherTenantId = uuidv4();

    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Settings T1', urlSlug: slug },
        { id: otherTenantId, name: 'Settings T2', urlSlug: otherSlug },
      ],
    });

    const ownerId = uuidv4();
    const staffId = uuidv4();
    const otherOwnerId = uuidv4();

    await prisma.user.createMany({
      data: [
        { id: ownerId, email: `owner-${runId}@t.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId },
        { id: staffId, email: `staff-${runId}@t.com`, hashedPassword: 'x', role: 'STAFF', tenantId },
        { id: otherOwnerId, email: `owner2-${runId}@t.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', tenantId: otherTenantId },
      ],
    });

    ownerToken = tokenService.sign({ userId: ownerId, role: 'BUSINESS_OWNER', tenantId, tenantSlug: slug, warehouseId: null });
    staffToken = tokenService.sign({ userId: staffId, role: 'STAFF', tenantId, tenantSlug: slug, warehouseId: null });
    otherOwnerToken = tokenService.sign({ userId: otherOwnerId, role: 'BUSINESS_OWNER', tenantId: otherTenantId, tenantSlug: otherSlug, warehouseId: null });
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
    await prisma.notification.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  });

  const get = (token: string, tenantSlug = slug) =>
    request(app).get(`/api/${tenantSlug}/settings`).set('Cookie', [`jwt=${token}`]);

  const put = (token: string, body: any, tenantSlug = slug) =>
    request(app).put(`/api/${tenantSlug}/settings`).set('Cookie', [`jwt=${token}`]).send(body);

  describe('defaults', () => {
    it('gives every existing tenant working localization without a backfill', async () => {
      // The columns are NOT NULL with defaults, so a tenant created before this
      // feature existed still reads sensible values rather than nulls.
      const res = await get(ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('USD');
      expect(res.body.locale).toBe('en-US');
      expect(res.body.timezone).toBe('UTC');
      expect(res.body.dateFormat).toBe('MM/DD/YYYY');
    });

    it('reports an unset company profile as null rather than empty string', async () => {
      const res = await get(ownerToken);

      expect(res.body.contactEmail).toBeNull();
      expect(res.body.addressLine).toBeNull();
      expect(res.body.registrationNumber).toBeNull();
    });
  });

  describe('role gating', () => {
    it('lets Staff read settings', async () => {
      // Staff need the currency to render prices, so reading is not restricted.
      await get(staffToken).expect(200);
    });

    it('refuses a Staff write', async () => {
      const res = await put(staffToken, { currency: 'GBP' });

      expect(res.status).toBe(403);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.currency).toBe('USD');
    });

    it('refuses an unauthenticated write', async () => {
      await request(app).put(`/api/${slug}/settings`).send({ currency: 'GBP' }).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it("refuses an owner writing to another tenant's settings", async () => {
      const res = await put(otherOwnerToken, { currency: 'GBP' });

      expect(res.status).toBe(403);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.currency).toBe('USD');
    });

    it('writes only to the tenant in the URL', async () => {
      await put(ownerToken, { currency: 'GBP' }).expect(200);

      const other = await prisma.tenant.findUnique({ where: { id: otherTenantId } });
      expect(other?.currency).toBe('USD');
    });
  });

  describe('validation', () => {
    it('rejects a currency code that is not real', async () => {
      // Left unchecked this reaches Intl.NumberFormat, which throws RangeError —
      // a crashed Reports page rather than a cosmetic defect.
      const res = await put(ownerToken, { currency: 'DOLLARS' });

      expect(res.status).toBe(400);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.currency).toBe('USD');
    });

    it('accepts any real ISO currency, not just the ones the picker lists', async () => {
      // The UI offers a shortlist; the server validates against the full
      // Intl.supportedValuesOf('currency') set, so the list can grow client-side
      // with no server change.
      await put(ownerToken, { currency: 'ETB' }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.currency).toBe('ETB');
    });

    it('rejects a timezone that is not an IANA name', async () => {
      const res = await put(ownerToken, { timezone: 'Pacific Time' });
      expect(res.status).toBe(400);
    });

    it('accepts a real IANA timezone', async () => {
      await put(ownerToken, { timezone: 'Africa/Addis_Ababa' }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.timezone).toBe('Africa/Addis_Ababa');
    });

    it('rejects a locale outside the supported list', async () => {
      // Structurally valid BCP-47, but not one we actually support — the check
      // is "can we honour this", not "does it parse".
      const res = await put(ownerToken, { locale: 'zz-ZZ' });
      expect(res.status).toBe(400);
    });

    it('rejects an unsupported date format', async () => {
      await put(ownerToken, { dateFormat: 'YYYY/DD/MM' }).expect(400);
    });

    it('FR-LNG-04 accepts the Albanian date format, day.month.year', async () => {
      await put(ownerToken, { dateFormat: 'DD.MM.YYYY' }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.dateFormat).toBe('DD.MM.YYYY');
    });

    it('rejects a malformed contact email', async () => {
      await put(ownerToken, { contactEmail: 'not-an-email' }).expect(400);
    });

    it('refuses to blank out the company name', async () => {
      // Unlike the profile fields, name is NOT NULL: it can change but not clear.
      const res = await put(ownerToken, { name: '   ' });

      expect(res.status).toBe(400);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.name).toBe('Settings T1');
    });
  });

  describe('partial updates', () => {
    it('leaves quotation approval alone when the request does not mention it', async () => {
      // The regression this file exists for. `Boolean(undefined)` is false, so
      // the old controller turned approval off on any PUT that omitted it.
      await put(ownerToken, { currency: 'GBP' }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.requiresQuotationApproval).toBe(true);
      expect(tenant?.currency).toBe('GBP');
    });

    it('changes nothing at all for an empty body', async () => {
      const before = await prisma.tenant.findUnique({ where: { id: tenantId } });

      await put(ownerToken, {}).expect(200);

      const after = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(after).toEqual(before);
    });

    it('can still set quotation approval to false when asked explicitly', async () => {
      await put(ownerToken, { requiresQuotationApproval: false }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.requiresQuotationApproval).toBe(false);
    });

    it('does not clear profile fields that the request omits', async () => {
      await put(ownerToken, { addressCity: 'Addis Ababa', contactPhone: '+251900000000' }).expect(200);
      await put(ownerToken, { currency: 'EUR' }).expect(200);

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(tenant?.addressCity).toBe('Addis Ababa');
      expect(tenant?.contactPhone).toBe('+251900000000');
    });
  });

  describe('company profile', () => {
    it('stores the profile fields and returns them', async () => {
      const res = await put(ownerToken, {
        name: 'Acme Trading PLC',
        registrationNumber: 'ET-12345678',
        addressLine: '12 Bole Road',
        addressCity: 'Addis Ababa',
        addressState: 'Addis Ababa',
        addressPostalCode: '1000',
        contactEmail: 'billing@acme.example',
        contactPhone: '+251911223344',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Acme Trading PLC',
        registrationNumber: 'ET-12345678',
        addressCity: 'Addis Ababa',
        contactEmail: 'billing@acme.example',
      });
    });

    it('treats a cleared field as unset rather than as an empty string', async () => {
      await put(ownerToken, { addressCity: 'Addis Ababa' }).expect(200);
      const res = await put(ownerToken, { addressCity: '' });

      expect(res.status).toBe(200);
      expect(res.body.addressCity).toBeNull();
    });

    it('trims surrounding whitespace', async () => {
      const res = await put(ownerToken, { addressCity: '  Addis Ababa  ' });
      expect(res.body.addressCity).toBe('Addis Ababa');
    });

    it('returns stored state rather than echoing the request', async () => {
      // The old handler returned what it had just coerced, so it could confirm a
      // change that never happened.
      const res = await put(ownerToken, { currency: 'GBP' });

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      expect(res.body.currency).toBe(tenant?.currency);
      expect(res.body.requiresQuotationApproval).toBe(tenant?.requiresQuotationApproval);
    });
  });
});
