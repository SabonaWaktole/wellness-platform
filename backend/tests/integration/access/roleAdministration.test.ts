import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { DEFAULT_ROLE_MATRIX } from '../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/** A role's grants as the admin screen submits them. */
const gridOf = (grants: Record<string, string | true>) =>
  Object.entries(grants).map(([key, grant]) => ({ key, scope: grant === true ? null : grant }));

/**
 * Slice 6 end to end (UAT-3 step 3): the Administrator edits a role's
 * permissions and the role's holders feel it on their very next request, with
 * the token they already hold; custom roles are copied from existing ones and
 * behave as their permissions say (FR-RBAC-03, 04, 08, 10).
 */
describe('Roles & permissions administration (FR-RBAC-03, 04, 08, 10)', () => {
  const tenantId = `t-roleadmin-${randomUUID()}`;
  const slug = tenantId;
  const uid = (label: string) => `u-roleadmin-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), reception: uid('reception'), manager: uid('manager'), junior: uid('junior') };
  const companyOfJunior = `c-roleadmin-${randomUUID()}`;
  const companyOfManager = `c-roleadmin-mgr-${randomUUID()}`;
  let roles: Record<RoleKey, string>;
  let app: express.Express;
  const tokens: Record<keyof typeof users, string> = {} as any;

  const as = (who: keyof typeof users) => {
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
    return {
      get: (path: string) => auth(request(app).get(`/api/${slug}${path}`)),
      post: (path: string) => auth(request(app).post(`/api/${slug}${path}`)),
      put: (path: string) => auth(request(app).put(`/api/${slug}${path}`)),
      patch: (path: string) => auth(request(app).patch(`/api/${slug}${path}`)),
      delete: (path: string) => auth(request(app).delete(`/api/${slug}${path}`)),
    };
  };

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Role admin tenant', urlSlug: slug } });
    roles = await seedSystemRoles(prisma, tenantId);
    const user = (id: string, roleKey: RoleKey, legacyRole = 'STAFF') => ({
      id, email: `${id}@example.com`, hashedPassword: 'x', role: legacyRole, roleId: roles[roleKey], tenantId,
    });
    await prisma.user.createMany({
      data: [
        user(users.admin, RoleKey.Administrator, 'BUSINESS_OWNER'),
        user(users.reception, RoleKey.Reception),
        user(users.manager, RoleKey.SalesManager),
        user(users.junior, RoleKey.Reception),
      ],
    });
    await prisma.client.createMany({
      data: [
        { id: companyOfJunior, tenantId, name: 'Junior Co', assignedUserId: users.junior, customFieldValues: {}, lastUpdatedByUserId: users.admin },
        { id: companyOfManager, tenantId, name: 'Manager Co', assignedUserId: users.manager, customFieldValues: {}, lastUpdatedByUserId: users.admin },
      ],
    });
    for (const who of Object.keys(users) as Array<keyof typeof users>) {
      tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: slug } as any);
    }
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-RBAC-03 lists the catalogue and every role with its grants and holders', async () => {
    const res = await as('admin').get('/roles').expect(200);

    expect(res.body.catalogue).toContainEqual({ key: 'commercial.view', group: 'commercial', supportsScope: true, milestone: 'M2' });
    const reception = res.body.roles.find((role: any) => role.key === RoleKey.Reception);
    expect(reception).toMatchObject({ isSystem: true, users: 2, grants: DEFAULT_ROLE_MATRIX[RoleKey.Reception] });
  });

  it('FR-RBAC-05 refuses the screen to a role without roles.manage', async () => {
    await as('manager').get('/roles').expect(403);
    await as('reception').put(`/roles/${roles[RoleKey.Reception]}/permissions`).send({ permissions: [] }).expect(403);
  });

  it('UAT-3 FR-RBAC-03 removing contract validity from Reception takes it away on Reception\'s next request', async () => {
    await as('reception').get(`/contracts/client/${companyOfJunior}`).expect(200);
    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokens.reception}`).expect(200);
    expect(before.body.user.permissions['contracts.validity.view']).toBe('ALL');

    const withoutValidity = gridOf(DEFAULT_ROLE_MATRIX[RoleKey.Reception]).filter((row) => row.key !== 'contracts.validity.view');
    const saved = await as('admin').put(`/roles/${roles[RoleKey.Reception]}/permissions`).send({ permissions: withoutValidity }).expect(200);
    expect(saved.body.role.grants['contracts.validity.view']).toBeUndefined();

    await as('reception').get(`/contracts/client/${companyOfJunior}`).expect(403);
    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokens.reception}`).expect(200);
    expect(after.body.user.permissions['contracts.validity.view']).toBeUndefined();
    expect(after.headers['x-permissions-version']).not.toBe(before.headers['x-permissions-version']);

    // FR-RBAC-10: one entry, naming the role, the permission removed, and both sets.
    const entries = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Role', entityId: roles[RoleKey.Reception] } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: users.admin, userRole: 'ADMINISTRATOR', action: 'UPDATE', entityLabel: 'Recepsion' });
    expect(entries[0].changes).toEqual(
      expect.arrayContaining([
        { field: 'permissionsRemoved', old: ['contracts.validity.view'], new: null },
        expect.objectContaining({ field: 'permissions', old: expect.objectContaining({ 'contracts.validity.view': 'ALL' }) }),
      ])
    );

    await as('admin').put(`/roles/${roles[RoleKey.Reception]}/permissions`).send({ permissions: gridOf(DEFAULT_ROLE_MATRIX[RoleKey.Reception]) }).expect(200);
    await as('reception').get(`/contracts/client/${companyOfJunior}`).expect(200);
  });

  it('FR-RBAC-02 refuses a key outside the catalogue or a scope on a plain capability', async () => {
    const res = await as('admin')
      .put(`/roles/${roles[RoleKey.Reception]}/permissions`)
      .send({ permissions: [{ key: 'roles.manage', scope: 'ALL' }] })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_PERMISSION_GRANT', permissionKey: 'roles.manage' });

    await as('admin').put(`/roles/${roles[RoleKey.Reception]}/permissions`).send({ permissions: [{ key: 'x.y', scope: null }] }).expect(400);
  });

  it('FR-RBAC-08 the last role holding roles.manage cannot lose it, and nothing changes', async () => {
    const withoutRolesManage = gridOf(DEFAULT_ROLE_MATRIX[RoleKey.Administrator]).filter((row) => row.key !== 'roles.manage');

    const res = await as('admin').put(`/roles/${roles[RoleKey.Administrator]}/permissions`).send({ permissions: withoutRolesManage }).expect(409);

    expect(res.body.code).toBe('LAST_ROLE_MANAGER');
    await as('admin').get('/roles').expect(200);
    expect(await prisma.rolePermission.count({ where: { roleId: roles[RoleKey.Administrator], permissionKey: 'roles.manage' } })).toBe(1);
  });

  describe('custom roles (FR-RBAC-04)', () => {
    let juniorRoleId: string;

    it('FR-RBAC-04 copies Sales User into a custom role', async () => {
      const res = await as('admin')
        .post(`/roles/${roles[RoleKey.SalesUser]}/copy`)
        .send({ nameSq: 'Shitës i ri', nameEn: 'Junior Sales' })
        .expect(201);

      juniorRoleId = res.body.role.id;
      expect(res.body.role).toMatchObject({ isSystem: false, baseKey: RoleKey.SalesUser, grants: DEFAULT_ROLE_MATRIX[RoleKey.SalesUser] });
      const entry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'Role', entityId: juniorRoleId } });
      expect(entry.action).toBe('CREATE');
    });

    it('refuses a copy named like an existing role', async () => {
      const res = await as('admin').post(`/roles/${roles[RoleKey.SalesUser]}/copy`).send({ nameSq: 'Diçka', nameEn: 'CEO' }).expect(409);
      expect(res.body.code).toBe('ROLE_NAME_TAKEN');
    });

    it('FR-RBAC-04 a custom copied role can be assigned and behaves as the source role did', async () => {
      await as('admin').put(`/auth/staff/${users.junior}`).send({ roleId: juniorRoleId }).expect(200);

      // Own scope, like a Sales User: their own company, not the manager's.
      const own = await as('junior').get('/clients/search').expect(200);
      expect(own.body.items.map((company: any) => company.id)).toEqual([companyOfJunior]);
      await as('junior').get(`/clients/${companyOfManager}`).expect(404);

      // And a Sales User for Team scope: the manager sees the junior's company.
      await as('manager').get(`/clients/${companyOfJunior}`).expect(200);

      const staff = await prisma.user.findUniqueOrThrow({ where: { id: users.junior } });
      expect(staff.role).toBe('STAFF');
    });

    it('renames the custom role', async () => {
      await as('admin').patch(`/roles/${juniorRoleId}`).send({ nameSq: 'Shitës fillestar', nameEn: 'Starter Sales' }).expect(200);

      const res = await as('admin').get('/roles').expect(200);
      expect(res.body.roles.find((role: any) => role.id === juniorRoleId)).toMatchObject({ nameEn: 'Starter Sales', users: 1 });
    });

    it('refuses to delete it while a user holds it', async () => {
      const res = await as('admin').delete(`/roles/${juniorRoleId}`).expect(409);
      expect(res.body).toMatchObject({ code: 'ROLE_IN_USE', users: 1, invitations: 0 });
    });

    it('deletes it once no one holds it', async () => {
      await as('admin').put(`/auth/staff/${users.junior}`).send({ roleId: roles[RoleKey.Reception] }).expect(200);

      await as('admin').delete(`/roles/${juniorRoleId}`).expect(204);
      expect(await prisma.role.findUnique({ where: { id: juniorRoleId } })).toBeNull();
    });
  });

  it('FR-RBAC-01 a system role cannot be renamed or deleted', async () => {
    expect((await as('admin').patch(`/roles/${roles[RoleKey.Ceo]}`).send({ nameSq: 'Drejtor', nameEn: 'Director' }).expect(409)).body.code).toBe(
      'SYSTEM_ROLE_LOCKED'
    );
    await as('admin').delete(`/roles/${roles[RoleKey.Ceo]}`).expect(409);
  });

  it('answers 404 for a role of another workspace', async () => {
    await as('admin').put(`/roles/role-from-elsewhere/permissions`).send({ permissions: [] }).expect(404);
  });
});
