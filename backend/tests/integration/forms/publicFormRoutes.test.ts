import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createFormRouter } from '../../../src/forms/interfaces/http/routes/formRoutes';
import { createPublicFormRouter } from '../../../src/forms/interfaces/http/routes/publicFormRoutes';
import { GetPublicFormUseCase } from '../../../src/forms/application/use-cases/GetPublicFormUseCase';
import { SubmitFormUseCase } from '../../../src/forms/application/use-cases/SubmitFormUseCase';
import { PrismaClientFormRepository } from '../../../src/forms/infrastructure/repositories/PrismaClientFormRepository';
import { PrismaFormVersionRepository } from '../../../src/forms/infrastructure/repositories/PrismaFormVersionRepository';
import { PrismaFormSubmissionRepository } from '../../../src/forms/infrastructure/repositories/PrismaFormSubmissionRepository';
import { PrismaCustomFieldDefinitionRepository } from '../../../src/clients/infrastructure/repositories/PrismaCustomFieldDefinitionRepository';
import { PrismaClientRepository } from '../../../src/clients/infrastructure/repositories/PrismaClientRepository';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { EnsureDefaultClientFieldsUseCase } from '../../../src/clients/application/use-cases/EnsureDefaultClientFieldsUseCase';
import { CreateClientUseCase } from '../../../src/clients/application/use-cases/CreateClientUseCase';
import { ITokenService } from '../../../src/auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { FieldType } from '../../../src/clients/domain/enums/FieldType';
import { ComponentType } from '../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../src/forms/domain/enums/FormFieldType';
import { emptyPageGeometry } from '../../../src/forms/domain/value-objects/FormDocument';

const prisma = new PrismaClient();

// A tenant id unique to this suite — see TD-001 (shared per-worker schemas).
const TENANT = 't-publicFormRoutes';
const USER = 'u-publicFormRoutes';
const STAFF_USER = 'u-publicFormRoutes-staff';

class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): any {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  }
}

const stubTokenService = new NonCryptographicStubTokenService();
const ownerToken = stubTokenService.sign({ userId: USER, role: UserRole.BUSINESS_OWNER, tenantId: TENANT, tenantSlug: TENANT });

const stubTenantRepo: ITenantRepository = {
  findById: async () => null,
  findBySlug: async (slug: string) =>
    slug === TENANT ? Tenant.create({ id: TENANT, name: 'Public Form Tenant', urlSlug: TENANT, createdAt: new Date() }) : null,
  create: async (t: any) => t,
  updateSettingsForMany: async () => 0,
  findAll: async () => ({ items: [], total: 0 }),
  updateSettings: async () => {},
  setSubscriptionStatus: async () => {},
};

const app = express();
app.use(express.json());
app.use('/api/public/forms', createPublicFormRouter(
  new GetPublicFormUseCase(new PrismaClientFormRepository(prisma), new PrismaFormVersionRepository(prisma)),
  new SubmitFormUseCase(
    new PrismaClientFormRepository(prisma),
    new PrismaFormVersionRepository(prisma),
    new PrismaFormSubmissionRepository(prisma),
    new PrismaCustomFieldDefinitionRepository(prisma),
    new PrismaUserRepository(prisma),
    new CreateClientUseCase(
      new PrismaClientRepository(prisma),
      new PrismaCustomFieldDefinitionRepository(prisma),
      new EnsureDefaultClientFieldsUseCase(new PrismaCustomFieldDefinitionRepository(prisma), new PrismaClientRepository(prisma))
    )
  )
));
app.use('/api/:tenantSlug/forms', createFormRouter(prisma, stubTokenService, stubTenantRepo));

const cleanup = async () => {
  await prisma.formSubmission.deleteMany({ where: { tenantId: TENANT } });
  await prisma.formVersion.deleteMany({ where: { tenantId: TENANT } });
  await prisma.clientForm.deleteMany({ where: { tenantId: TENANT } });
  await prisma.client.deleteMany({ where: { tenantId: TENANT } });
  await prisma.customFieldDefinition.deleteMany({ where: { tenantId: TENANT } });
};

const layoutWith = (elements: any[]) => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [{ id: 'p1', sections: [{ id: 's1', title: 'Section', x: 0, y: 0, width: 600, height: 300, elements }] }],
});

const textField = (key: string, over: Record<string, any> = {}) => ({
  id: `el-${key}`,
  type: ComponentType.INPUT,
  x: 0,
  y: 0,
  width: 300,
  height: 50,
  field: { key, label: key, dataType: FormFieldType.TEXT, required: false, ...over },
});

describe('Public form routes', () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'Public Form Tenant', urlSlug: TENANT },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: { id: USER, email: 'publicform@test.test', hashedPassword: 'hash', role: 'BUSINESS_OWNER', tenantId: TENANT },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: STAFF_USER },
      create: { id: STAFF_USER, email: 'publicform-staff@test.test', hashedPassword: 'hash', role: 'STAFF', tenantId: TENANT },
      update: {},
    });
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.tenant.update({ where: { id: TENANT }, data: { clientFormSeededAt: null } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [USER, STAFF_USER] } } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  /** Creates a form, saves a layout and publishes it; returns the form id and share token. */
  const createPublishedForm = async (elements: any[]) => {
    const created = await request(app)
      .post(`/api/${TENANT}/forms`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Public Form ${Date.now()}-${Math.random()}` });

    const saved = await request(app)
      .put(`/api/${TENANT}/forms/${created.body.id}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ layout: layoutWith(elements), expectedVersion: created.body.version });

    const published = await request(app)
      .post(`/api/${TENANT}/forms/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ expectedVersion: saved.body.version });

    return { formId: created.body.id, shareToken: published.body.form.shareToken as string };
  };

  it('serves the published document at the share token', async () => {
    const { shareToken } = await createPublishedForm([textField('comment')]);

    const res = await request(app).get(`/api/public/forms/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.document.pages[0].sections[0].elements[0].field.key).toBe('comment');
    expect(res.body.formId).toBeDefined();
  });

  it('404s an unknown token and a token for a form still in draft', async () => {
    const unknown = await request(app).get('/api/public/forms/does-not-exist');
    expect(unknown.status).toBe(404);

    const draftForm = await request(app)
      .post(`/api/${TENANT}/forms`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Never Published' });
    // A draft has no share token at all — no route to even reach it, but
    // confirm the public GET treats a made-up guess the same as any other
    // unknown token rather than leaking which ids exist.
    const res = await request(app).get(`/api/public/forms/${draftForm.body.id}`);
    expect(res.status).toBe(404);
  });

  it('accepts a valid submission and it appears in the tenant submissions list and detail', async () => {
    const { formId, shareToken } = await createPublishedForm([textField('comment', { required: true })]);

    const submit = await request(app)
      .post(`/api/public/forms/${shareToken}/submit`)
      .send({ data: { comment: 'Hello there' } });
    expect(submit.status).toBe(201);
    expect(submit.body.id).toBeDefined();

    const list = await request(app)
      .get(`/api/${TENANT}/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(submit.body.id);

    const detail = await request(app)
      .get(`/api/${TENANT}/forms/${formId}/submissions/${submit.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toEqual({ comment: 'Hello there' });
    expect(detail.body.version.versionNumber).toBe(1);
  });

  it('refuses an invalid submission with per-field errors, and saves nothing', async () => {
    const { formId, shareToken } = await createPublishedForm([textField('comment', { required: true })]);

    const res = await request(app).post(`/api/public/forms/${shareToken}/submit`).send({ data: {} });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty('comment');

    const list = await request(app)
      .get(`/api/${TENANT}/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.body).toHaveLength(0);
  });

  it('creates a Client from a submission whose fields are bound, keyed by the live definition name', async () => {
    // A client needs every REQUIRED roled field resolvable (name, status —
    // see `Client.create`), so seed the tenant's real defaults rather than
    // hand-rolling one standalone definition that satisfies only NAME.
    const seeded = await new EnsureDefaultClientFieldsUseCase(
      new PrismaCustomFieldDefinitionRepository(prisma),
      new PrismaClientRepository(prisma)
    ).execute(TENANT);
    const nameDef = seeded.find((d) => d.role === 'PRIMARY_NAME')!;
    const statusDef = seeded.find((d) => d.role === 'STATUS')!;
    expect(nameDef).toBeDefined();
    expect(statusDef).toBeDefined();

    const { shareToken } = await createPublishedForm([
      textField('name', { clientFieldId: nameDef.id }),
      textField('status', { clientFieldId: statusDef.id }),
    ]);

    const submit = await request(app)
      .post(`/api/public/forms/${shareToken}/submit`)
      .send({ data: { name: 'Ada Lovelace', status: statusDef.options![0] } });
    expect(submit.status).toBe(201);

    const clients = await prisma.client.findMany({ where: { tenantId: TENANT } });
    expect(clients).toHaveLength(1);
    expect((clients[0].customFieldValues as any)[nameDef.fieldName]).toBe('Ada Lovelace');
  });

  /*
   * The core promise of structured submissions (spec §5, §8, §27): a
   * submission is pinned to the EXACT version it was filled against. Editing
   * the draft and republishing must never retroactively change what an
   * already-collected submission shows, and its data keys must survive
   * untouched even though the live document has moved on.
   */
  it('keeps a submission pinned to its original version after the form is edited and republished', async () => {
    const { formId, shareToken } = await createPublishedForm([textField('comment')]);

    const firstSubmit = await request(app)
      .post(`/api/public/forms/${shareToken}/submit`)
      .send({ data: { comment: 'Filled against version 1' } });
    expect(firstSubmit.status).toBe(201);

    // Edit the draft (relabel the field) and republish — version 2.
    const draft = await request(app)
      .get(`/api/${TENANT}/forms/${formId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const relabeled = draft.body.layout;
    relabeled.pages[0].sections[0].elements[0].field.label = 'Renamed label';
    const saved = await request(app)
      .put(`/api/${TENANT}/forms/${formId}/layout`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ layout: relabeled, expectedVersion: draft.body.version });
    await request(app)
      .post(`/api/${TENANT}/forms/${formId}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ expectedVersion: saved.body.version });

    const detail = await request(app)
      .get(`/api/${TENANT}/forms/${formId}/submissions/${firstSubmit.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(detail.body.version.versionNumber).toBe(1);
    expect(detail.body.document.pages[0].sections[0].elements[0].field.label).toBe('comment');
    expect(detail.body.data).toEqual({ comment: 'Filled against version 1' });
  });

  it('refuses submissions and versions to a staff member', async () => {
    const staffToken = stubTokenService.sign({ userId: STAFF_USER, role: UserRole.STAFF, tenantId: TENANT, tenantSlug: TENANT });
    const { formId } = await createPublishedForm([textField('comment')]);

    const res = await request(app)
      .get(`/api/${TENANT}/forms/${formId}/submissions`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
