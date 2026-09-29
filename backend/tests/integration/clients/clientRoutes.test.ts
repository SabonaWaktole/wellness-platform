import request from 'supertest';
import express from 'express';
import ExcelJS from 'exceljs';
import { createClientRouter } from '../../../src/clients/interfaces/http/routes/clientRoutes';
import { PrismaClient } from '@prisma/client';
import { ClientStatus } from '../../../src/clients/domain/enums/ClientStatus';
import { ITokenService } from '../../../src/auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { FieldType } from '../../../src/clients/domain/enums/FieldType';

const prisma = new PrismaClient();

// Deliberately skips signature verification, purely to test authorization/business logic in isolation.
class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): any {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch {
      throw new Error('Invalid token');
    }
  }
}

const stubTokenService = new NonCryptographicStubTokenService();
const validToken = stubTokenService.sign({ userId: 'u1', role: UserRole.BUSINESS_OWNER, tenantId: 't1', tenantSlug: 't1' });
// Its own user: permissions are resolved from the database per request
// (FR-RBAC-01, D1), so a STAFF-signed token for the owner's id would still
// read as the Administrator.
const staffToken = stubTokenService.sign({ userId: 'u-staff-cr', role: UserRole.STAFF, tenantId: 't1', tenantSlug: 't1' });

/** Builds a one-sheet .xlsx in memory so imports can be posted as real uploads. */
const workbook = async (rows: any[][]): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await wb.xlsx.writeBuffer());
};

// Stub tenantRepository so real resolveTenant middleware can resolve by slug
const stubTenantRepo: ITenantRepository = {
  findById: async () => null,
  // Built through Tenant.create rather than as an object literal: a literal has
  // to be updated by hand every time the entity gains a field, which is how this
  // double broke on the last three entity changes. See TD-002.
  findBySlug: async (slug: string) => {
    if (slug === 't1') return Tenant.create({ id: 't1', name: 'Tenant 1', urlSlug: 't1', createdAt: new Date() });
    if (slug === 't2') return Tenant.create({ id: 't2', name: 'Tenant 2', urlSlug: 't2', createdAt: new Date() });
    return null;
  },
  create: async (t: any) => t,
  updateSettingsForMany: async () => 0,
  findAll: async () => ({ items: [], total: 0 }),
  updateSettings: async () => {},
  setSubscriptionStatus: async () => {},
};

// We removed the authenticate mock so we can test the real JWT extraction and validation.
// We removed the resolveTenant mock so we can test the real cross-tenant isolation.

const app = express();
app.use(express.json());
app.use('/api/:tenantSlug/clients', createClientRouter(prisma, stubTokenService, stubTenantRepo));

describe('Client Routes', () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: 't1' },
      create: { id: 't1', name: 'Tenant 1', urlSlug: 't1' },
      update: {},
    });
    
    // Create the mock user to satisfy foreign key constraints
    await prisma.user.upsert({
      where: { id: 'u1' },
      create: {
        id: 'u1',
        email: 'test@test.com',
        hashedPassword: 'hash',
        role: 'BUSINESS_OWNER',
        tenantId: 't1'
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: 'u-staff-cr' },
      create: {
        id: 'u-staff-cr',
        email: 'staff-cr@test.com',
        hashedPassword: 'hash',
        role: 'STAFF',
        tenantId: 't1'
      },
      update: {},
    });

    // Clean up leftover data
    await prisma.interaction.deleteMany({ where: { client: { tenantId: 't1' } } });
    await prisma.client.deleteMany({ where: { tenantId: 't1' } });
    await prisma.customFieldDefinition.deleteMany({ where: { tenantId: 't1' } });
    await prisma.outcomeCategory.deleteMany({ where: { tenantId: 't1' } });
    // Wiping CustomFieldDefinition rows without also clearing this stamp is
    // exactly the bug it exists to prevent, turned against the fixture
    // itself: a prior run (or another suite reusing 't1' in the same worker)
    // can leave the tenant "seeded" with none of its Name/Status/etc. fields
    // actually present, so every client create in THIS run 400s with
    // 'Field "Name" is not defined for this tenant.' — a failure that looks
    // like it belongs to whichever test happens to run first, not to setup.
    await prisma.tenant.update({ where: { id: 't1' }, data: { clientFieldsSeededAt: null } });

    // A minimal Slice 11 profile every POST /clients in this file sends —
    // this suite is about the client routes generally, not about companies
    // specifically, so one fixed business type/area/city is enough.
    await prisma.riskLevel.upsert({
      where: { id: 'rl-routes-test' },
      create: { id: 'rl-routes-test', tenantId: 't1', level: 1, nameSq: 'I ulët', updatedAt: new Date() },
      update: {},
    });
    await prisma.businessType.upsert({
      where: { id: 'bt-routes-test' },
      create: { id: 'bt-routes-test', tenantId: 't1', nameSq: 'Kafene', riskLevelId: 'rl-routes-test', updatedAt: new Date() },
      update: {},
    });
    await prisma.area.upsert({
      where: { id: 'area-routes-test' },
      create: { id: 'area-routes-test', tenantId: 't1', nameSq: 'Tiranë', updatedAt: new Date() },
      update: {},
    });
    await prisma.city.upsert({
      where: { id: 'city-routes-test' },
      create: { id: 'city-routes-test', tenantId: 't1', areaId: 'area-routes-test', nameSq: 'Tiranë', updatedAt: new Date() },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.interaction.deleteMany({ where: { client: { tenantId: 't1' } } });
    await prisma.client.deleteMany({ where: { tenantId: 't1' } });
    await prisma.customFieldDefinition.deleteMany({ where: { tenantId: 't1' } });
    await prisma.outcomeCategory.deleteMany({ where: { tenantId: 't1' } });
    await prisma.notification.deleteMany({ where: { recipientUserId: 'u1' } });
    await prisma.user.deleteMany({ where: { id: { in: ['u1', 'u-staff-cr'] } } });
    await prisma.city.deleteMany({ where: { id: 'city-routes-test' } });
    await prisma.area.deleteMany({ where: { id: 'area-routes-test' } });
    await prisma.businessType.deleteMany({ where: { id: 'bt-routes-test' } });
    await prisma.riskLevel.deleteMany({ where: { id: 'rl-routes-test' } });
    await prisma.$disconnect();
  });

  /** The Slice 11 profile every POST /clients in this file sends. */
  const validProfile = {
    businessTypeId: 'bt-routes-test',
    employeeCount: 5,
    areaId: 'area-routes-test',
    cityId: 'city-routes-test',
  };

  /** The Slice 12 initial contacts every POST /clients in this file sends. */
  const validContacts = [{ name: 'Jane Doe', phone: '+355691234567' }];

  it('POST /settings/custom-fields defines a field', async () => {
    const res = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'industry', fieldType: 'TEXT' });
    
    expect(res.status).toBe(201);
    expect(res.body.fieldName).toBe('industry');
  });

  /*
   * Before this was fixed, a duplicate name reached the database's unique
   * constraint and the raw Prisma error — an internal file path and a
   * multi-line query dump — came back as the response body.
   */
  it('POST /settings/custom-fields refuses a duplicate name with a clean 400, not a raw Prisma error', async () => {
    const first = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'duplicate-name-test', fieldType: 'TEXT' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'duplicate-name-test', fieldType: 'TEXT' });

    expect(second.status).toBe(400);
    expect(second.body.error).toBe('A field named "duplicate-name-test" already exists.');
    expect(second.body.error).not.toContain('PrismaCustomFieldDefinitionRepository');
    expect(second.body.error).not.toContain('Unique constraint failed');
  });

  it('PATCH/DELETE/reorder custom-fields work end to end', async () => {
    const create = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'temp-field', fieldType: 'TEXT' });
    expect(create.status).toBe(201);
    const fieldId = create.body.id;

    const patch = await request(app)
      .patch(`/api/t1/clients/settings/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'renamed-field', required: true });
    expect(patch.status).toBe(200);
    expect(patch.body.fieldName).toBe('renamed-field');
    expect(patch.body.required).toBe(true);

    // Staff cannot edit or delete field definitions.
    const forbiddenPatch = await request(app)
      .patch(`/api/t1/clients/settings/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fieldName: 'nope' });
    expect(forbiddenPatch.status).toBe(403);

    const before = await request(app)
      .get('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`);
    const orderedIds = before.body.map((f: any) => f.id);
    const reordered = [orderedIds[orderedIds.length - 1], ...orderedIds.slice(0, -1)];

    const reorderRes = await request(app)
      .post('/api/t1/clients/settings/custom-fields/reorder')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ orderedFieldIds: reordered });
    expect(reorderRes.status).toBe(204);

    const afterReorder = await request(app)
      .get('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`);
    expect(afterReorder.body.map((f: any) => f.id)).toEqual(reordered);

    const del = await request(app)
      .delete(`/api/t1/clients/settings/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${validToken}`);
    expect(del.status).toBe(200);
    expect(del.body.deletedFieldName).toBe('renamed-field');

    const afterDelete = await request(app)
      .get('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`);
    expect(afterDelete.body.some((f: any) => f.id === fieldId)).toBe(false);
  });

  it('POST /settings/outcome-categories defines a category', async () => {
    const res = await request(app)
      .post('/api/t1/clients/settings/outcome-categories')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ label: 'Closed Won' });
    
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Closed Won');
  });

  let createdClientId: string;

  it('POST / creates a client', async () => {
    // name/email/phone/status/assignedUserId are no longer top-level fields —
    // they're custom field values keyed by the tenant's default field names
    // ("Name"/"Status"/...), auto-seeded on first use by
    // EnsureDefaultClientFieldsUseCase.
    const res = await request(app)
      .post('/api/t1/clients')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        customFieldValues: { Name: 'Routes Test Corp', Status: ClientStatus.PROSPECT, industry: 'Software' },
        profile: validProfile,
        contacts: validContacts,
      });

    if (res.status !== 201) {
      console.log('CREATE CLIENT ERROR:', res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Routes Test Corp');
    createdClientId = res.body.id;
  });

  it('GET /search returns clients', async () => {
    const res = await request(app)
      .get('/api/t1/clients/search')
      .set('Authorization', `Bearer ${validToken}`)
      .query({ name: 'Routes Test' });
    
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].name).toBe('Routes Test Corp');
    expect(res.body.total).toBe(1);
  });

  it('PUT /:clientId updates a client partially', async () => {
    const res = await request(app)
      .put(`/api/t1/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ customFieldValues: { Name: 'Updated Corp' } }); // ONLY sending Name

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Corp');
    // Ensure omitted fields are NOT nulled out
    expect(res.body.status).toBe(ClientStatus.PROSPECT);
    expect(res.body.customFieldValues).toMatchObject({ industry: 'Software', Name: 'Updated Corp' });
  });

  it('PUT /:clientId merges customFieldValues instead of wholesale replacing', async () => {
    // First, add another field definition
    await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'region', fieldType: 'TEXT' });

    // Update client to have two custom fields
    await request(app)
      .put(`/api/t1/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ customFieldValues: { industry: 'Software', region: 'EU' } });

    // Now do a partial update of ONLY the region
    const res = await request(app)
      .put(`/api/t1/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ customFieldValues: { region: 'US' } });

    expect(res.status).toBe(200);
    // 'industry' should survive the merge!
    expect(res.body.customFieldValues).toMatchObject({ industry: 'Software', region: 'US' });
  });

  it('GET /:clientId returns client details', async () => {
    const res = await request(app)
      .get(`/api/t1/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdClientId);
    expect(res.body.name).toBe('Updated Corp');
  });

  it('GET /settings/custom-fields returns defined fields', async () => {
    const res = await request(app)
      .get('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.map((f: any) => f.fieldName)).toContain('industry');
  });

  it('GET /settings/outcome-categories returns defined categories', async () => {
    const res = await request(app)
      .get('/api/t1/clients/settings/outcome-categories')
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].label).toBe('Closed Won');
  });

  it('POST /:clientId/interactions adds an interaction', async () => {
    const res = await request(app)
      .post(`/api/t1/clients/${createdClientId}/interactions`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({ content: 'Great call!', channel: 'CALL' });
    
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Great call!');
  });

  it('GET /:clientId/history returns history interleaved with appointments', async () => {
    // Create an appointment for this client
    await prisma.appointment.create({
      data: {
        id: 'appt-history-1',
        tenantId: 't1',
        clientId: createdClientId,
        assignedUserId: 'u1',
        scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
        status: 'SCHEDULED'
      }
    });

    const res = await request(app)
      .get(`/api/t1/clients/${createdClientId}/history`)
      .set('Authorization', `Bearer ${validToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.timeline.length).toBeGreaterThanOrEqual(2);
    
    const types = res.body.timeline.map((t: any) => t.type);
    expect(types).toContain('INTERACTION_ADDED');
    expect(types).toContain('APPOINTMENT_SCHEDULED');

    // Verify sort order: descending timestamp
    const t1 = new Date(res.body.timeline[0].timestamp).getTime();
    const t2 = new Date(res.body.timeline[1].timestamp).getTime();
    expect(t1).toBeGreaterThanOrEqual(t2);

    await prisma.appointment.delete({ where: { id: 'appt-history-1' } });
  });

  // Validation tests
  it('POST / returns 400 for missing name', async () => {
    // "Name" is auto-seeded as `required: true` — omitting it from
    // customFieldValues entirely must still be rejected domain-side.
    const res = await request(app)
      .post('/api/t1/clients')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ customFieldValues: { Status: ClientStatus.PROSPECT }, profile: validProfile, contacts: validContacts });

    expect(res.status).toBe(400);
  });

  it('POST /settings/custom-fields returns 400 for missing fieldName', async () => {
    const res = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldType: 'TEXT' });
    
    expect(res.status).toBe(400);
  });

  describe('Excel import', () => {
    it('POST /settings/custom-fields/import creates the definitions in the sheet', async () => {
      const file = await workbook([
        ['fieldName', 'fieldType', 'options'],
        ['Company Size', 'ALPHANUMERIC', ''],
        ['Lead Source', 'SINGLE_SELECT', 'Web; Referral'],
        ['Bad!Name', 'TEXT', ''],
      ]);

      const res = await request(app)
        .post('/api/t1/clients/settings/custom-fields/import')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', file, 'fields.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.errors).toHaveLength(1);

      const stored = await prisma.customFieldDefinition.findMany({
        where: { tenantId: 't1', fieldName: { in: ['Company Size', 'Lead Source'] } },
      });
      expect(stored).toHaveLength(2);
      // The spaced name is the case this whole change exists for.
      expect(stored.map(s => s.fieldName)).toContain('Company Size');
    });

    it('POST /settings/custom-fields/import is refused for staff', async () => {
      const file = await workbook([['fieldName', 'fieldType'], ['Anything', 'TEXT']]);

      const res = await request(app)
        .post('/api/t1/clients/settings/custom-fields/import')
        .set('Authorization', `Bearer ${staffToken}`)
        .attach('file', file, 'fields.xlsx');

      expect(res.status).toBe(403);
    });

    it('POST /import creates a client per row and reports the bad ones', async () => {
      const file = await workbook([
        ['name', 'email', 'status', 'Company Size'],
        ['Imported Alpha', 'alpha@example.com', 'ACTIVE', 'AB 12'],
        ['', 'nameless@example.com', 'ACTIVE', 'AB 12'],
        ['Imported Beta', '', 'PROSPECT', 'AB-12'],
      ]);

      const res = await request(app)
        .post('/api/t1/clients/import')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', file, 'clients.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      // Row 3 has no name; row 4 breaks the ALPHANUMERIC rule.
      expect(res.body.errors.map((e: any) => e.row)).toEqual([3, 4]);

      const alpha = await prisma.client.findFirst({ where: { tenantId: 't1', name: 'Imported Alpha' } });
      expect(alpha).not.toBeNull();
      expect(alpha!.customFieldValues).toMatchObject({
        'Company Size': 'AB 12',
        Name: 'Imported Alpha',
        Email: 'alpha@example.com',
        // The sheet still says 'ACTIVE' (the pre-Slice-11 option); the import
        // remaps it the same way the Slice 11 migration remapped existing rows.
        Status: 'CLIENT',
      });
    });

    it('POST /import rejects an upload with no file', async () => {
      const res = await request(app)
        .post('/api/t1/clients/import')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });

    it('GET /import/template names every custom field as a column', async () => {
      const res = await request(app)
        .get('/api/t1/clients/import/template')
        .set('Authorization', `Bearer ${validToken}`)
        .buffer()
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const header = wb.worksheets[0]!.getRow(1).values as any[];
      expect(header).toEqual(expect.arrayContaining(['name', 'status', 'Company Size']));
    });
  });

  it('POST /settings/custom-fields accepts a field name containing spaces', async () => {
    const res = await request(app)
      .post('/api/t1/clients/settings/custom-fields')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ fieldName: 'Account Manager', fieldType: FieldType.TEXT });

    expect(res.status).toBe(201);
    expect(res.body.fieldName).toBe('Account Manager');
  });

  it('Cross-Tenant Isolation: returns 403 when Tenant 1 user acts on Tenant 2 slug', async () => {
    // req.user is mocked to belong to tenantId 't1' in our authenticate mock.
    // We try to POST to /api/t2/clients. resolveTenant will find tenant 't2'.
    // The cross-tenant check in resolveTenant should see user.tenantId ('t1') !== req.tenant.id ('t2') and return 403.
    const res = await request(app)
      .post('/api/t2/clients')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        name: 'Sneaky Corp',
        status: ClientStatus.PROSPECT,
      });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cross-tenant access forbidden');
  });

  /*
   * THE CLIENTS TAB CAME UP EMPTY.
   *
   * A query string has no types, so `{ archived: false }` reaches the server as
   * the literal string "false" — and the schema coerced it with
   * `z.coerce.boolean()`, i.e. `Boolean('false')`, which is TRUE. The default
   * view therefore asked for ARCHIVED clients on every load, and any workspace
   * that had archived nothing saw an empty list while the API answered exactly
   * what it had been asked.
   *
   * Asserted here at the HTTP boundary rather than on the schema alone,
   * because the wire format IS the bug: a test that passes a real boolean
   * cannot see it.
   */
  describe('GET /search — the archived flag as it arrives on the wire', () => {
    const activeId = 'archived-flag-active';
    const archivedId = 'archived-flag-archived';

    beforeAll(async () => {
      await prisma.client.createMany({
        data: [
          {
            id: activeId,
            tenantId: 't1',
            name: 'Active Annie',
            status: ClientStatus.CLIENT,
            customFieldValues: {},
            lastUpdatedByUserId: 'u1',
            deletedAt: null,
          },
          {
            id: archivedId,
            tenantId: 't1',
            name: 'Archived Archie',
            status: ClientStatus.CLIENT,
            customFieldValues: {},
            lastUpdatedByUserId: 'u1',
            deletedAt: new Date(),
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.client.deleteMany({ where: { id: { in: [activeId, archivedId] } } });
    });

    const ids = (body: any) => body.items.map((c: any) => c.id);

    it('returns the ACTIVE clients for ?archived=false, which is what the tab sends', async () => {
      const res = await request(app)
        .get('/api/t1/clients/search?search=&archived=false')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(ids(res.body)).toContain(activeId);
      expect(ids(res.body)).not.toContain(archivedId);
    });

    it('returns the ARCHIVED clients for ?archived=true', async () => {
      const res = await request(app)
        .get('/api/t1/clients/search?archived=true')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(ids(res.body)).toContain(archivedId);
      expect(ids(res.body)).not.toContain(activeId);
    });

    it('defaults to the active clients when the flag is left off entirely', async () => {
      const res = await request(app)
        .get('/api/t1/clients/search')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(ids(res.body)).toContain(activeId);
      expect(ids(res.body)).not.toContain(archivedId);
    });
  });
});
