import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { DEFAULT_ROLE_MATRIX } from '../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { AUDIT_ENTITY_GROUP_KEYS, AUDITED_ENTITY_TYPES } from '../../../src/audit/domain/AuditQuery';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const gridOf = (grants: Record<string, string | true>) =>
  Object.entries(grants).map(([key, grant]) => ({ key, scope: grant === true ? null : grant }));

/**
 * Slice 7 end to end (UAT-3 step 4): Administrator and CEO can search the
 * audit trail Slices 2, 5 and 6 already write, open an entry to see its
 * old/new values, and export the same filter as CSV. Everyone else is
 * refused, and the trail stays read-only (FR-AUD-05, 06, 08).
 */
describe('Audit log viewer (FR-AUD-06, 08)', () => {
  const tenantId = `t-auditview-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-auditview-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), ceo: uid('ceo'), reception: uid('reception') };
  let roles: Record<RoleKey, string>;
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;
  let roleEntryId: string;
  let userEntryId: string;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return { get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)) };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Audit viewer tenant', urlSlug: slug } });
    roles = await seedSystemRoles(prisma, tenantId);
    const user = (id: string, roleKey: RoleKey) => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [user(users.admin, RoleKey.Administrator), user(users.ceo, RoleKey.Ceo), user(users.reception, RoleKey.Reception)],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }

    // A Role/UPDATE entry (Slice 6): remove a permission from Reception.
    const withoutValidity = gridOf(DEFAULT_ROLE_MATRIX[RoleKey.Reception]).filter((row) => row.key !== 'contracts.validity.view');
    await request(app)
      .put(`/api/${slug}/roles/${roles[RoleKey.Reception]}/permissions`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ permissions: withoutValidity })
      .expect(200);

    // A User/UPDATE entry (Slice 5): change Reception's own role.
    await request(app)
      .put(`/api/${slug}/auth/staff/${users.reception}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ roleId: roles[RoleKey.SalesUser] })
      .expect(200);

    const roleEntry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'Role' } });
    roleEntryId = roleEntry.id;
    const userEntry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'User' } });
    userEntryId = userEntry.id;
  });

  afterAll(async () => {
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-AUD-06 refuses the log to a role without audit.view', async () => {
    await as('reception').get('/audit').expect(403);
    await as('reception').get(`/audit/${roleEntryId}`).expect(403);
    await as('reception').get('/audit/export.csv').expect(403);
  });

  it('FR-AUD-06 lists both entries newest first for the Administrator', async () => {
    const res = await as('admin').get('/audit').expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    const ids = res.body.data.map((entry: any) => entry.id);
    expect(ids.indexOf(userEntryId)).toBeLessThan(ids.indexOf(roleEntryId));
  });

  it('the CEO can also read the log, read-only', async () => {
    await as('ceo').get('/audit').expect(200);
  });

  it('FR-AUD-06 filters by entity type, action, user and date range', async () => {
    const byType = await as('admin').get('/audit?entityType=Role').expect(200);
    expect(byType.body.data.every((entry: any) => entry.entityType === 'Role')).toBe(true);
    expect(byType.body.data.map((entry: any) => entry.id)).toContain(roleEntryId);
    expect(byType.body.data.map((entry: any) => entry.id)).not.toContain(userEntryId);

    const byAction = await as('admin').get('/audit?action=UPDATE').expect(200);
    expect(byAction.body.data.map((entry: any) => entry.id)).toEqual(expect.arrayContaining([roleEntryId, userEntryId]));

    const byUser = await as('admin').get(`/audit?userId=${users.admin}`).expect(200);
    expect(byUser.body.data.map((entry: any) => entry.id)).toEqual(expect.arrayContaining([roleEntryId, userEntryId]));

    const future = new Date(Date.now() + 60_000).toISOString();
    const byDate = await as('admin').get(`/audit?from=${future}`).expect(200);
    expect(byDate.body.data).toHaveLength(0);
  });

  it('FR-AUD-10 serves every audited entity type, grouped, to the filter', async () => {
    const res = await as('admin').get('/audit/entity-types').expect(200);
    const types = res.body.groups.flatMap((group: any) => group.types);
    expect([...types].sort()).toEqual([...AUDITED_ENTITY_TYPES].sort());
    expect(res.body.groups.map((group: any) => group.group)).toEqual([...AUDIT_ENTITY_GROUP_KEYS]);
    expect(res.body.groups.find((group: any) => group.group === 'pricing').types).toEqual([
      'EmployeeBand', 'RiskSurcharge', 'VisitFrequency', 'PriceZone', 'PricingSettings',
    ]);
    await as('reception').get('/audit/entity-types').expect(403);
  });

  it('FR-AUD-10 filtering by a group returns only that group\'s entries', async () => {
    const access = await as('admin').get('/audit?entityGroup=access').expect(200);
    expect(access.body.data.map((entry: any) => entry.id)).toEqual(expect.arrayContaining([roleEntryId, userEntryId]));

    const lists = await as('admin').get('/audit?entityGroup=lists').expect(200);
    expect(lists.body.data).toHaveLength(0);

    const narrowed = await as('admin').get('/audit?entityGroup=access&entityType=Role').expect(200);
    expect(narrowed.body.data.map((entry: any) => entry.id)).toEqual([roleEntryId]);

    const outside = await as('admin').get('/audit?entityGroup=contracts&entityType=Role').expect(200);
    expect(outside.body.data).toHaveLength(0);

    await as('admin').get('/audit?entityGroup=nope').expect(400);
  });

  it('paginates', async () => {
    const res = await as('admin').get('/audit?limit=1&page=1').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('FR-AUD-06 opens one entry with its old and new values and the actor resolved', async () => {
    const res = await as('admin').get(`/audit/${roleEntryId}`).expect(200);
    expect(res.body.entry).toMatchObject({ id: roleEntryId, entityType: 'Role', userRole: 'ADMINISTRATOR' });
    expect(res.body.entry.changes).toEqual(
      expect.arrayContaining([{ field: 'permissionsRemoved', old: ['contracts.validity.view'], new: null }])
    );
    expect(res.body.entry.userName).toBeTruthy();
  });

  it('answers 404 for an id that does not exist', async () => {
    await as('admin').get('/audit/does-not-exist').expect(404);
  });

  it('FR-AUD-05 the trail stays read-only: no PUT, PATCH or DELETE route exists', async () => {
    await request(app).put(`/api/${slug}/audit/${roleEntryId}`).set('Authorization', `Bearer ${tokens.admin}`).expect(404);
    await request(app).patch(`/api/${slug}/audit/${roleEntryId}`).set('Authorization', `Bearer ${tokens.admin}`).expect(404);
    await request(app).delete(`/api/${slug}/audit/${roleEntryId}`).set('Authorization', `Bearer ${tokens.admin}`).expect(404);
  });

  it('FR-AUD-08 the CSV export matches the same filter, with a BOM and a header row', async () => {
    const res = await request(app)
      .get(`/api/${slug}/audit/export.csv?entityType=Role`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);

    const lines = res.text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('at,user,role,action,entityType,entityId,entityLabel,field,old,new');
    const dataLines = lines.slice(1);
    expect(dataLines.some((line) => line.includes(roles[RoleKey.Reception]))).toBe(true);
    // Every data row is for the Role entity, matching the on-screen filter.
    for (const line of dataLines) {
      expect(line.split(',')[4]).toBe('Role');
    }
  });
});
