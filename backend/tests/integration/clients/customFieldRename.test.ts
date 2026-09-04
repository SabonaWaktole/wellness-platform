import request from 'supertest';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createClientRouter } from '../../../src/clients/interfaces/http/routes/clientRoutes';
import { ITokenService } from '../../../src/auth/application/ports/ITokenService';
import { ITenantRepository } from '../../../src/tenant/domain/repositories/ITenantRepository';
import { Tenant } from '../../../src/tenant/domain/entities/Tenant';
import { UserRole } from '../../../src/auth/domain/enums/UserRole';
import { FieldType } from '../../../src/clients/domain/enums/FieldType';

const prisma = new PrismaClient();

/*
 * A tenant id unique to this suite, not the shared 't1' used by
 * clientRoutes.test.ts — see TD-001. Per-worker schemas mean a worker's schema
 * is shared by every FILE assigned to it, so reusing 't1' risks one suite's
 * teardown deleting a neighbour's fixtures mid-run.
 */
const TENANT = 't-customFieldRename';
const USER = 'u-customFieldRename';

class NonCryptographicStubTokenService implements ITokenService {
  sign(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
  verify(token: string): any {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  }
}

const stubTokenService = new NonCryptographicStubTokenService();
const ownerToken = stubTokenService.sign({
  userId: USER,
  role: UserRole.BUSINESS_OWNER,
  tenantId: TENANT,
  tenantSlug: TENANT,
});

const stubTenantRepo: ITenantRepository = {
  findById: async () => null,
  findBySlug: async (slug: string) =>
    slug === TENANT
      ? Tenant.create({ id: TENANT, name: 'Rename Tenant', urlSlug: TENANT, createdAt: new Date() })
      : null,
  create: async (t: any) => t,
  updateSettingsForMany: async () => 0,
  findAll: async () => ({ items: [], total: 0 }),
  updateSettings: async () => {},
  setSubscriptionStatus: async () => {},
};

const app = express();
app.use(express.json());
app.use('/api/:tenantSlug/clients', createClientRouter(prisma, stubTokenService, stubTenantRepo));

const cleanup = async () => {
  await prisma.client.deleteMany({ where: { tenantId: TENANT } });
  await prisma.customFieldDefinition.deleteMany({ where: { tenantId: TENANT } });
};

describe('Renaming a custom field moves existing client data', () => {
  beforeAll(async () => {
    await prisma.tenant.upsert({
      where: { id: TENANT },
      create: { id: TENANT, name: 'Rename Tenant', urlSlug: TENANT },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER },
      create: {
        id: USER,
        email: 'rename@test.test',
        hashedPassword: 'hash',
        role: 'BUSINESS_OWNER',
        tenantId: TENANT,
      },
      update: {},
    });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it('moves the stored value under the new key, and leaves it readable', async () => {
    const define = await request(app)
      .post(`/api/${TENANT}/clients/settings/custom-fields`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Industry', fieldType: FieldType.TEXT });
    expect(define.status).toBe(201);
    const fieldId = define.body.id;

    const created = await request(app)
      .post(`/api/${TENANT}/clients`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customFieldValues: { Name: 'Acme', Status: 'PROSPECT', Industry: 'Healthcare' }, notes: '' });
    expect(created.status).toBe(201);
    const clientId = created.body.id;

    const rename = await request(app)
      .patch(`/api/${TENANT}/clients/settings/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Sector' });
    expect(rename.status).toBe(200);
    expect(rename.body.fieldName).toBe('Sector');

    // Read the row directly rather than through the app: this is the fact
    // under test, not something a GET's shaping could paper over.
    const row = await prisma.client.findUnique({ where: { id: clientId } });
    const values = row!.customFieldValues as Record<string, unknown>;
    expect(values).toMatchObject({ Sector: 'Healthcare' });
    expect(values).not.toHaveProperty('Industry');

    const fetched = await request(app)
      .get(`/api/${TENANT}/clients/${clientId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fetched.body.customFieldValues).toMatchObject({ Sector: 'Healthcare' });
  });

  it('is a no-op for a client that never had the field set', async () => {
    const define = await request(app)
      .post(`/api/${TENANT}/clients/settings/custom-fields`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Website', fieldType: FieldType.TEXT });
    const fieldId = define.body.id;

    const created = await request(app)
      .post(`/api/${TENANT}/clients`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customFieldValues: { Name: 'Beta', Status: 'PROSPECT' }, notes: '' });
    const clientId = created.body.id;

    const rename = await request(app)
      .patch(`/api/${TENANT}/clients/settings/custom-fields/${fieldId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'URL' });
    expect(rename.status).toBe(200);

    const row = await prisma.client.findUnique({ where: { id: clientId } });
    const values = row!.customFieldValues as Record<string, unknown>;
    expect(values).not.toHaveProperty('URL');
    expect(values).not.toHaveProperty('Website');
  });

  it('leaves other clients and other fields untouched', async () => {
    const defA = await request(app)
      .post(`/api/${TENANT}/clients/settings/custom-fields`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Segment', fieldType: FieldType.TEXT });
    const defB = await request(app)
      .post(`/api/${TENANT}/clients/settings/custom-fields`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Notes2', fieldType: FieldType.TEXT });

    const c1 = await request(app)
      .post(`/api/${TENANT}/clients`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customFieldValues: { Name: 'C1', Status: 'PROSPECT', Segment: 'SMB', Notes2: 'keep me' }, notes: '' });
    const c2 = await request(app)
      .post(`/api/${TENANT}/clients`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customFieldValues: { Name: 'C2', Status: 'PROSPECT', Notes2: 'also keep me' }, notes: '' });

    await request(app)
      .patch(`/api/${TENANT}/clients/settings/custom-fields/${defA.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fieldName: 'Tier' });

    const row1 = await prisma.client.findUnique({ where: { id: c1.body.id } });
    const row2 = await prisma.client.findUnique({ where: { id: c2.body.id } });
    expect(row1!.customFieldValues).toMatchObject({ Tier: 'SMB', Notes2: 'keep me' });
    expect(row1!.customFieldValues).not.toHaveProperty('Segment');
    // c2 never had Segment set — must gain no stray "Tier" key.
    expect(row2!.customFieldValues).toMatchObject({ Notes2: 'also keep me' });
    expect(row2!.customFieldValues).not.toHaveProperty('Tier');
    expect(row2!.customFieldValues).not.toHaveProperty('Segment');
    expect(defB.body.fieldName).toBe('Notes2');
  });
});
