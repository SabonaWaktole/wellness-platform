import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createFormRouter } from '../../../src/forms/interfaces/http/routes/formRoutes';
import { ITokenService } from '../../../src/auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { FieldType } from '../../../src/clients/domain/enums/FieldType';
import { ComponentType } from '../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../src/forms/domain/enums/FormFieldType';
import { emptyPageGeometry } from '../../../src/forms/domain/value-objects/FormDocument';

const prisma = new PrismaClient();

/*
 * A tenant id unique to this suite, not the shared 't1' — see TD-001. Per-worker
 * schemas mean a worker's schema is shared by every FILE assigned to it, so a
 * suite that reuses 't1' and wipes it can delete a neighbour's fixtures, and the
 * failure lands in an innocent file that passes on re-run.
 */
const TENANT = 't-formRoutes';
const USER = 'u-formRoutes';

// Deliberately skips signature verification, purely to test authorization and
// business logic in isolation.
class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): any {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  }
}

const stubTokenService = new NonCryptographicStubTokenService();
// Staff has its own user: permissions are resolved from the database per
// request (FR-RBAC-01), not from the token's role claim.
const STAFF_USER = 'u-formRoutes-staff';
const tokenFor = (userId: string, role: UserRole) =>
  stubTokenService.sign({ userId, role, tenantId: TENANT, tenantSlug: TENANT });
const ownerToken = tokenFor(USER, UserRole.BUSINESS_OWNER);
const staffToken = tokenFor(STAFF_USER, UserRole.STAFF);

const stubTenantRepo: ITenantRepository = {
  findById: async () => null,
  findBySlug: async (slug: string) =>
    slug === TENANT
      ? Tenant.create({ id: TENANT, name: 'Forms Tenant', urlSlug: TENANT, createdAt: new Date() })
      : null,
  create: async (t: any) => t,
  updateSettingsForMany: async () => 0,
  findAll: async () => ({ items: [], total: 0 }),
  updateSettings: async () => {},
  setSubscriptionStatus: async () => {},
  setSalesWorkflow: async () => {},
};

const app = express();
app.use(express.json());
app.use('/api/:tenantSlug/forms', createFormRouter(prisma, stubTokenService, stubTenantRepo));

/** Scoped to this suite's tenant only — never a bare deleteMany.
 *  FormVersion is RESTRICT-FK'd to ClientForm, so it must go first. */
const cleanup = async () => {
  await prisma.formVersion.deleteMany({ where: { tenantId: TENANT } });
  await prisma.clientForm.deleteMany({ where: { tenantId: TENANT } });
  await prisma.customFieldDefinition.deleteMany({ where: { tenantId: TENANT } });
};

const defineField = async (
  id: string,
  fieldName: string,
  over: Partial<{ required: boolean; fieldType: string; options: any }> = {}
) =>
  prisma.customFieldDefinition.create({
    data: {
      id,
      tenantId: TENANT,
      fieldName,
      fieldType: over.fieldType ?? FieldType.TEXT,
      options: over.options ?? [],
      order: 0,
      required: over.required ?? false,
    },
  });

const getDefault = () =>
  request(app).get(`/api/${TENANT}/forms/default`).set('Authorization', `Bearer ${ownerToken}`);

const layoutWith = (elements: any[]) => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [
    {
      id: 'p1',
      sections: [
        { id: 's1', title: 'Company Information', x: 0, y: 0, width: 600, height: 300, elements },
      ],
    },
  ],
});

/** A v3 data-bearing element. `clientFieldId` binds it to a definition. */
const fieldEl = (over: Record<string, any>) => {
  const { fieldId, key, label, ...rest } = over;
  return {
    x: 0,
    y: 0,
    width: 300,
    height: 50,
    type: ComponentType.INPUT,
    ...rest,
    field: {
      key: key ?? `key_${fieldId}`,
      label: label ?? 'Company Name',
      dataType: FormFieldType.TEXT,
      required: false,
      clientFieldId: fieldId,
    },
  };
};

/** Every element in a response document, flattened across pages/sections. */
const elementsIn = (layout: any): any[] =>
  layout.pages.flatMap((p: any) => p.sections).flatMap((s: any) => s.elements);

/** The clientFieldId each element binds, in document order. */
const boundFieldIds = (layout: any): (string | undefined)[] =>
  elementsIn(layout).map((e: any) => e.field?.clientFieldId);

describe('Form Routes', () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'Forms Tenant', urlSlug: TENANT },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: {
        id: USER,
        email: 'forms@test.test',
        hashedPassword: 'hash',
        role: 'BUSINESS_OWNER',
        tenantId: TENANT,
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: STAFF_USER },
      create: { id: STAFF_USER, email: 'forms-staff@test.test', hashedPassword: 'hash', role: 'STAFF', tenantId: TENANT },
      update: {},
    });
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.tenant.update({
      where: { id: TENANT },
      data: { clientFormSeededAt: null },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [USER, STAFF_USER] } } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it('seeds the default form from the tenant fields on first read', async () => {
    await defineField('ff-1', 'Company Name');
    await defineField('ff-2', 'Email');

    const res = await getDefault();

    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.layout.pages).toHaveLength(1);
    expect(res.body.layout.pages[0].sections).toHaveLength(1);
    expect(boundFieldIds(res.body.layout)).toEqual(['ff-1', 'ff-2']);
    expect(res.body.definitions).toHaveLength(2);
    expect(res.body.layout.version).toBe(3);
    expect(res.body.layout.page.width).toBeGreaterThan(0);
  });

  /*
   * The whole point of the one-shot stamp: a form the owner deleted must not
   * reappear on the next page load.
   */
  it('does not re-seed a second time', async () => {
    await defineField('ff-1', 'Company Name');
    const first = await getDefault();
    await getDefault();

    const forms = await prisma.clientForm.findMany({ where: { tenantId: TENANT } });
    expect(forms).toHaveLength(1);
    expect(forms[0].id).toBe(first.body.id);
  });

  it('lets staff read the form they have to fill in', async () => {
    await defineField('ff-1', 'Company Name');
    const res = await request(app)
      .get(`/api/${TENANT}/forms/default`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  it('refuses an unauthenticated read', async () => {
    const res = await request(app).get(`/api/${TENANT}/forms/default`);
    expect(res.status).toBe(401);
  });

  it('saves a layout and bumps the version', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        layout: layoutWith([fieldEl({ id: 'i1', fieldId: 'ff-1', width: 400 })]),
        expectedVersion: seeded.body.version,
      });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(seeded.body.version + 1);
    expect(res.body.layout.pages[0].sections[0].title).toBe('Company Information');
    expect(res.body.layout.pages[0].sections[0].elements[0].width).toBe(400);
  });

  it('refuses a layout save from staff', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        layout: layoutWith([fieldEl({ id: 'i1', fieldId: 'ff-1' })]),
        expectedVersion: seeded.body.version,
      });

    expect(res.status).toBe(403);
  });

  /*
   * 409, not 400: the request was well-formed, it is simply based on state that
   * no longer exists. Answering 400 would tell the builder to show a validation
   * error about something the owner did not do.
   */
  it('answers 409 when another session saved first', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();
    const body = {
      layout: layoutWith([fieldEl({ id: 'i1', fieldId: 'ff-1' })]),
      expectedVersion: seeded.body.version,
    };

    const first = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body);
    expect(first.status).toBe(200);

    const second = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body);

    expect(second.status).toBe(409);
  });

  /*
   * A required field left off the form would make every submission fail with an
   * error naming a field nobody can see. Refused while the owner is looking at
   * it, not hours later in front of a customer.
   */
  it('refuses a layout that omits a required field', async () => {
    await defineField('ff-1', 'Company Name');
    await defineField('ff-2', 'Status', { required: true });
    const seeded = await getDefault();

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        layout: layoutWith([fieldEl({ id: 'i1', fieldId: 'ff-1' })]),
        expectedVersion: seeded.body.version,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('"Status"');
  });

  it('refuses the same field placed twice', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        layout: layoutWith([
          fieldEl({ id: 'i1', fieldId: 'ff-1' }),
          fieldEl({ id: 'i2', fieldId: 'ff-1', y: 100 }),
        ]),
        expectedVersion: seeded.body.version,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('appears more than once');
  });

  it('rejects a malformed accent colour at the edge', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        layout: layoutWith([
          fieldEl({ id: 'i1', fieldId: 'ff-1', styles: { textColor: 'red' } }),
        ]),
        expectedVersion: seeded.body.version,
      });

    expect(res.status).toBe(400);
  });

  /*
   * Fields created outside the builder (the Fields tab, the Excel importer)
   * belong to no layout. Without the rescue they would be invisible everywhere
   * and bulk field import would silently stop working.
   */
  it('appends fields added after seeding to a "not yet placed" section', async () => {
    await defineField('ff-1', 'Company Name');
    await getDefault();

    await defineField('ff-2', 'VAT Number');
    const res = await getDefault();

    const rescuePage = res.body.layout.pages.find((p: any) => p.id === 'unplaced-page');
    const unplaced = rescuePage.sections.find((s: any) => s.id === 'unplaced');
    expect(unplaced.elements.map((i: any) => i.field.clientFieldId)).toEqual(['ff-2']);
    expect(res.body.unplacedFieldIds).toEqual(['ff-2']);
  });

  /*
   * DELIBERATE v2 REVERSAL. v2 dropped an element whose definition was
   * deleted. A v3 field owns its own identity, so the dangling binding is
   * CLEARED and the field survives as a plain unbound form field — it keeps
   * collecting into FormSubmission.data, it just stops writing to the Client
   * record.
   */
  it('clears the binding of a field whose definition was deleted, keeping the field', async () => {
    await defineField('ff-1', 'Company Name');
    await defineField('ff-2', 'VAT Number');
    const seeded = await getDefault();
    expect(seeded.body.layout.pages[0].sections[0].elements).toHaveLength(2);

    await prisma.customFieldDefinition.delete({ where: { id: 'ff-2' } });
    const res = await getDefault();

    const onPageOne = res.body.layout.pages[0].sections[0].elements;
    expect(onPageOne).toHaveLength(2);
    expect(onPageOne.map((e: any) => e.field.clientFieldId)).toEqual(['ff-1', undefined]);
  });

  /*
   * A form saved by the branch BEFORE this rewrite is a v1 (grid) document
   * sitting in the database right now. It must keep opening through the API —
   * a blank canvas where a business owner's form used to be is a worse
   * failure than one that only approximately reflows.
   */
  it('reads a v1 (grid) form saved before the canvas rewrite via the v1->v2->v3 migration path', async () => {
    await defineField('ff-1', 'Company Name');
    await defineField('ff-2', 'Email');

    await prisma.clientForm.create({
      data: {
        id: 'legacy-v1-form',
        tenantId: TENANT,
        name: 'Legacy Grid Form',
        isDefault: false,
        status: 'PUBLISHED',
        version: 1,
        settings: {},
        layout: {
          version: 1,
          sections: [
            {
              id: 's1',
              title: 'Company Information',
              columns: 2,
              items: [
                { id: 'i1', kind: 'FIELD', fieldId: 'ff-1' },
                { id: 'i2', kind: 'FIELD', fieldId: 'ff-2' },
              ],
            },
          ],
        },
      },
    });

    const res = await request(app)
      .get(`/api/${TENANT}/forms/legacy-v1-form`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.layout.version).toBe(3);
    expect(res.body.layout.page.format).toBe('A4');
    expect(res.body.layout.page.width).toBeGreaterThan(0);
    expect(res.body.layout.pages.length).toBeGreaterThanOrEqual(1);
    // Both fields survive the two-step upgrade with their bindings intact.
    expect(boundFieldIds(res.body.layout)).toEqual(['ff-1', 'ff-2']);
    // And each one now owns a stable data identity of its own.
    for (const el of elementsIn(res.body.layout)) {
      expect(typeof el.x).toBe('number');
      expect(typeof el.y).toBe('number');
      expect(el.field.key).toEqual(expect.any(String));
      expect(el.field.key.length).toBeGreaterThan(0);
    }
  });

  it('404s a form belonging to another tenant', async () => {
    const res = await request(app)
      .get(`/api/${TENANT}/forms/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  describe('forms CRUD', () => {
    it('creates a new blank form and lists it alongside the default', async () => {
      await defineField('ff-1', 'Company Name');
      await getDefault();

      const create = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Quick Lead' });
      expect(create.status).toBe(201);
      expect(create.body.isDefault).toBe(false);

      const list = await request(app)
        .get(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(list.status).toBe(200);
      expect(list.body.map((f: any) => f.name).sort()).toEqual(['Client Intake', 'Quick Lead']);
    });

    it('refuses a staff member creating a form', async () => {
      const res = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Nope' });
      expect(res.status).toBe(403);
    });

    it('refuses two forms with the same name', async () => {
      await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Duplicate' });
      const res = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Duplicate' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('renames a form through settings', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Before' });

      const res = await request(app)
        .patch(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'After', expectedVersion: created.body.version });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('After');
      expect(res.body.version).toBe(created.body.version + 1);
    });

    it('promotes a new default form and demotes the old one', async () => {
      const seeded = await getDefault();
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'New Intake' });

      const res = await request(app)
        .patch(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ isDefault: true, expectedVersion: created.body.version });

      expect(res.status).toBe(200);
      expect(res.body.isDefault).toBe(true);

      const oldDefault = await request(app)
        .get(`/api/${TENANT}/forms/${seeded.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(oldDefault.body.isDefault).toBe(false);
    });

    it('refuses to delete the only client-intake form', async () => {
      const seeded = await getDefault();
      const res = await request(app)
        .delete(`/api/${TENANT}/forms/${seeded.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('client-intake form');
    });

    it('deletes a non-default form and it stops appearing in the list', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Disposable' });

      const del = await request(app)
        .delete(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(list.body.find((f: any) => f.id === created.body.id)).toBeUndefined();
    });

    it('duplicates a form, copying its layout but not its default status', async () => {
      await defineField('ff-1', 'Company Name');
      const seeded = await getDefault();

      const res = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/duplicate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Copy of Client Intake' });

      expect(res.status).toBe(201);
      expect(res.body.isDefault).toBe(false);

      const copy = await request(app)
        .get(`/api/${TENANT}/forms/${res.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(boundFieldIds(copy.body.layout)).toEqual(['ff-1']);
    });
  });

  describe('templates', () => {
    it('saves a form as a template without touching the source, and it appears only in the templates list', async () => {
      await defineField('ff-1', 'Company Name');
      const seeded = await getDefault();

      const saved = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/save-as-template`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Intake Template' });
      expect(saved.status).toBe(201);
      expect(saved.body.isTemplate).toBe(true);

      const forms = await request(app)
        .get(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(forms.body.find((f: any) => f.id === saved.body.id)).toBeUndefined();

      const templates = await request(app)
        .get(`/api/${TENANT}/forms/templates`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(templates.body.map((f: any) => f.id)).toContain(saved.body.id);

      const source = await request(app)
        .get(`/api/${TENANT}/forms/${seeded.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(source.body.isTemplate).toBe(false);
    });

    it('creates a new ordinary form from a template, independent of it', async () => {
      await defineField('ff-1', 'Company Name');
      const seeded = await getDefault();
      const saved = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/save-as-template`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Reusable Template' });

      const created = await request(app)
        .post(`/api/${TENANT}/forms/templates/${saved.body.id}/instantiate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'From Template' });
      expect(created.status).toBe(201);
      expect(created.body.isTemplate).toBe(false);
      expect(created.body.isDefault).toBe(false);

      // The new form is fully independent — editing it must never mutate
      // the template, the core promise `cloneDocumentWithFreshIds` exists
      // for (spec §30).
      const newForm = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const edit = await request(app)
        .put(`/api/${TENANT}/forms/${created.body.id}/layout`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ layout: layoutWith([]), expectedVersion: newForm.body.version });
      expect(edit.status).toBe(200);

      const templateAfter = await request(app)
        .get(`/api/${TENANT}/forms/${saved.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(boundFieldIds(templateAfter.body.layout)).toEqual(['ff-1']);
    });

    it('refuses a staff member saving or instantiating a template', async () => {
      const seeded = await getDefault();
      const save = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/save-as-template`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'X' });
      expect(save.status).toBe(403);

      const instantiate = await request(app)
        .post(`/api/${TENANT}/forms/templates/00000000-0000-0000-0000-000000000000/instantiate`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'X' });
      expect(instantiate.status).toBe(403);
    });

    it('404s instantiating a form that is not a template', async () => {
      const seeded = await getDefault();
      const res = await request(app)
        .post(`/api/${TENANT}/forms/templates/${seeded.body.id}/instantiate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('publishing and versions', () => {
    it('publishes a form, mints a share token, and the draft carries no unpublished-changes flag right after', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Publishable' });

      const publish = await request(app)
        .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: created.body.version });

      expect(publish.status).toBe(200);
      expect(publish.body.form.status).toBe('PUBLISHED');
      expect(publish.body.form.shareToken).toEqual(expect.any(String));
      expect(publish.body.form.hasUnpublishedChanges).toBe(false);
      expect(publish.body.version.versionNumber).toBe(1);

      const read = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(read.body.status).toBe('PUBLISHED');
      expect(read.body.hasUnpublishedChanges).toBe(false);
    });

    it('refuses a staff member publishing a form', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Staff Cannot' });

      const res = await request(app)
        .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ expectedVersion: created.body.version });
      expect(res.status).toBe(403);
    });

    it('refuses setting status to PUBLISHED through the settings endpoint', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'No Shortcut' });

      const res = await request(app)
        .patch(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'PUBLISHED', expectedVersion: created.body.version });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('publish action');
    });

    /*
     * The core promise of versioning: editing the draft after a publish must
     * NOT change what a client filling the already-shared link sees. A
     * second publish creates version 2, and version 1 stays exactly as it
     * was frozen (spec §8, §28).
     */
    it('keeps an old version byte-identical after the draft is edited and republished', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Stable History' });

      const original = layoutWith([]);
      const initialSave = await request(app)
        .put(`/api/${TENANT}/forms/${created.body.id}/layout`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ layout: original, expectedVersion: created.body.version });
      expect(initialSave.status).toBe(200);

      const firstPublish = await request(app)
        .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: initialSave.body.version });
      expect(firstPublish.body.version.versionNumber).toBe(1);
      const firstShareToken = firstPublish.body.form.shareToken;

      const draft = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(draft.body.hasUnpublishedChanges).toBe(false);

      const relabeled = layoutWith([]);
      relabeled.pages[0].sections[0].title = 'Renamed Section';
      const layoutSave = await request(app)
        .put(`/api/${TENANT}/forms/${created.body.id}/layout`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ layout: relabeled, expectedVersion: draft.body.version });
      expect(layoutSave.status).toBe(200);
      expect(layoutSave.body.hasUnpublishedChanges).toBe(true);

      const secondPublish = await request(app)
        .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: layoutSave.body.version });
      expect(secondPublish.body.version.versionNumber).toBe(2);
      // Re-publishing must never mint a second share token — the same link
      // a client may already have opened has to keep working.
      expect(secondPublish.body.form.shareToken).toBe(firstShareToken);

      const versionOne = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}/versions/1`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(versionOne.status).toBe(200);
      expect(versionOne.body.document.pages[0].sections[0].title).toBe('Company Information');

      const versionTwo = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}/versions/2`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(versionTwo.body.document.pages[0].sections[0].title).toBe('Renamed Section');

      const list = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}/versions`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(list.body.map((v: any) => v.versionNumber)).toEqual([2, 1]);
    });

    it('404s a version number that was never published', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Never Published' });

      const res = await request(app)
        .get(`/api/${TENANT}/forms/${created.body.id}/versions/1`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
    });

    it('reports a conflict rather than publishing against a stale expectedVersion', async () => {
      const created = await request(app)
        .post(`/api/${TENANT}/forms`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Conflict Check' });

      const res = await request(app)
        .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expectedVersion: created.body.version + 1 });
      expect(res.status).toBe(409);
    });
  });

  describe('image upload', () => {
    it('accepts a small PNG and returns a usable url', async () => {
      // A minimal valid 1x1 PNG, so sharp can actually decode it.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      );
      const seeded = await getDefault();

      const res = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/assets`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', png, 'logo.png');

      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\//);
      expect(res.body.width).toBeGreaterThan(0);
    });

    it('refuses an upload from staff', async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      );
      const seeded = await getDefault();

      const res = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/assets`)
        .set('Authorization', `Bearer ${staffToken}`)
        .attach('file', png, 'logo.png');

      expect(res.status).toBe(403);
    });

    it('rejects a non-image file', async () => {
      const seeded = await getDefault();
      const res = await request(app)
        .post(`/api/${TENANT}/forms/${seeded.body.id}/assets`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from('not an image'), 'notes.txt');

      expect(res.status).toBe(400);
    });
  });


  it('saves and reads back a TEXT element with the full whitelisted mark/node set', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const richDoc = {
      version: 3,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            {
              id: 's1',
              title: 'Rich text test',
              x: 48, y: 48, width: 600, height: 300,
              elements: [
                {
                  id: 'text1',
                  type: 'TEXT',
                  x: 0, y: 0, width: 500, height: 200,
                  content: {
                    type: 'doc',
                    content: [
                      {
                        type: 'heading',
                        attrs: { level: 2, textAlign: 'center' },
                        content: [{ type: 'text', text: 'Section Title' }],
                      },
                      {
                        type: 'paragraph',
                        attrs: { lineHeight: '1.5' },
                        content: [
                          { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
                          {
                            type: 'text',
                            text: 'coloured',
                            marks: [{ type: 'textStyle', attrs: { color: '#1d4ed8', fontSize: '18px' } }],
                          },
                          { type: 'text', text: ' text.' },
                        ],
                      },
                      {
                        type: 'bulletList',
                        content: [
                          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }] },
                          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }] },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ layout: richDoc, expectedVersion: seeded.body.version });

    expect(res.status).toBe(200);

    const readBack = await request(app)
      .get(`/api/${TENANT}/forms/${seeded.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const textEl = elementsIn(readBack.body.layout).find((e: any) => e.id === 'text1');
    expect(textEl.content).toEqual(richDoc.pages[0].sections[0].elements[0].content);
  });

  it('rejects a TEXT element carrying a node type outside the whitelist', async () => {
    await defineField('ff-1', 'Company Name');
    const seeded = await getDefault();

    const badDoc = {
      version: 3,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            {
              id: 's1', title: 'S', x: 48, y: 48, width: 400, height: 200,
              elements: [
                {
                  id: 'text1', type: 'TEXT', x: 0, y: 0, width: 300, height: 100,
                  content: { type: 'doc', content: [{ type: 'table', content: [] }] },
                },
              ],
            },
          ],
        },
      ],
    };

    const res = await request(app)
      .put(`/api/${TENANT}/forms/${seeded.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ layout: badDoc, expectedVersion: seeded.body.version });

    expect(res.status).toBe(400);
  });
});
