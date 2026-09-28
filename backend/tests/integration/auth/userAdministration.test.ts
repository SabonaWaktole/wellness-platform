import request from 'supertest';
import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { seedSystemRoles } from '../../support/seedRoles';
import { DeactivateUserUseCase } from '../../../src/auth/application/use-cases/DeactivateUserUseCase';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaUserAdminTransaction } from '../../../src/auth/infrastructure/PrismaUserAdminTransaction';
import { RoleManagementGuard } from '../../../src/access/application/RoleManagementGuard';
import { PrismaRoleCatalogue } from '../../../src/access/infrastructure/PrismaRoleCatalogue';
import { administrator } from '../../support/access';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

/**
 * Slice 5 end to end (UAT-5): the Administrator invites with a role, changes a
 * role, and the change reaches the user's very next request with the token
 * they already hold (FR-USR-02, 03, 06).
 */
describe('User administration on the new roles (UAT-5)', () => {
  const tenantId = `t-useradmin-${randomUUID()}`;
  const slug = tenantId;
  const adminId = `u-useradmin-admin-${randomUUID()}`;
  const salesId = `u-useradmin-sales-${randomUUID()}`;
  let roles: Record<RoleKey, string>;
  let app: express.Express;
  let adminToken: string;
  let salesToken: string;

  const as = (token: string) => ({
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'User admin tenant', urlSlug: slug } });
    roles = await seedSystemRoles(prisma, tenantId);
    await prisma.user.createMany({
      data: [
        { id: adminId, email: `${adminId}@example.com`, hashedPassword: 'x', role: 'BUSINESS_OWNER', roleId: roles[RoleKey.Administrator], tenantId },
        { id: salesId, email: `${salesId}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId: roles[RoleKey.SalesUser], tenantId },
      ],
    });
    adminToken = tokenService.sign({ userId: adminId, role: 'BUSINESS_OWNER', tenantId, tenantSlug: slug } as any);
    salesToken = tokenService.sign({ userId: salesId, role: 'STAFF', tenantId, tenantSlug: slug } as any);
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.auditEntry.deleteMany({ where: { tenantId } });
    await prisma.invitation.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('FR-USR-02 offers the workspace\'s five roles with both labels', async () => {
    const res = await as(adminToken).get(`/api/${slug}/auth/roles`).expect(200);

    expect(res.body.roles.map((r: { key: string }) => r.key).sort()).toEqual(
      ['ADMINISTRATOR', 'CEO', 'RECEPTION', 'SALES_MANAGER', 'SALES_USER']
    );
    expect(res.body.roles.find((r: { key: string }) => r.key === 'RECEPTION')).toMatchObject({ nameSq: 'Recepsion', nameEn: 'Reception' });
  });

  it('FR-USR-02 invites with a role, and the account is created with it', async () => {
    const email = `invitee-${randomUUID()}@example.com`;
    await as(adminToken).post(`/api/${slug}/auth/invitations`).send({ email, roleId: roles[RoleKey.Reception] }).expect(200);

    const invitation = await prisma.invitation.findFirstOrThrow({ where: { tenantId, email } });
    expect(invitation.roleId).toBe(roles[RoleKey.Reception]);

    await request(app).post('/api/auth/invitations/accept').send({ token: invitation.token, newPassword: 'Password123' }).expect(200);

    const user = await prisma.user.findFirstOrThrow({ where: { tenantId, email } });
    expect(user.roleId).toBe(roles[RoleKey.Reception]);
    const audited = await prisma.auditEntry.findMany({ where: { tenantId, entityId: { in: [invitation.id, user.id] } } });
    expect(audited.map((e) => e.entityType).sort()).toEqual(['Invitation', 'User']);
  });

  it('refuses a role from another workspace', async () => {
    const res = await as(adminToken)
      .post(`/api/${slug}/auth/invitations`)
      .send({ email: `x-${randomUUID()}@example.com`, roleId: 'role-from-nowhere' })
      .expect(400);
    expect(res.body.code).toBe('UNKNOWN_ROLE');
  });

  it('FR-USR-03 a role change reaches the user\'s next request, with the token they already hold', async () => {
    const before = await as(salesToken).get('/api/auth/me').expect(200);
    expect(before.body.user.permissions['users.manage']).toBeUndefined();
    await as(salesToken).get(`/api/${slug}/auth/roles`).expect(403);

    await as(adminToken).put(`/api/${slug}/auth/staff/${salesId}`).send({ roleId: roles[RoleKey.Administrator] }).expect(200);

    const after = await as(salesToken).get('/api/auth/me').expect(200);
    expect(after.body.user.permissions['users.manage']).toBe(true);
    expect(after.headers['x-permissions-version']).not.toBe(before.headers['x-permissions-version']);
    await as(salesToken).get(`/api/${slug}/auth/roles`).expect(200);

    // FR-USR-06: old role → new role, in the audit log.
    const entry = await prisma.auditEntry.findFirstOrThrow({ where: { tenantId, entityType: 'User', entityId: salesId, action: 'UPDATE' } });
    expect(entry.changes).toEqual([{ field: 'role', old: 'SALES_USER', new: 'ADMINISTRATOR' }]);
    expect(entry).toMatchObject({ userId: adminId, userRole: 'ADMINISTRATOR' });

    await as(adminToken).put(`/api/${slug}/auth/staff/${salesId}`).send({ roleId: roles[RoleKey.SalesUser] }).expect(200);
  });

  it('FR-USR-04 a deactivated user\'s still-valid token is refused on the next request', async () => {
    await as(adminToken).post(`/api/${slug}/auth/staff/${salesId}/deactivate`).send({}).expect(200);

    await as(salesToken).get(`/api/${slug}/clients/search`).expect(401);

    await as(adminToken).post(`/api/${slug}/auth/staff/${salesId}/reactivate`).expect(200);
    await as(salesToken).get(`/api/${slug}/clients/search`).expect(200);
  });

  it('GET /auth/staff names each member\'s role', async () => {
    const res = await as(adminToken).get(`/api/${slug}/auth/staff`).expect(200);

    const sales = res.body.items.find((m: { id: string }) => m.id === salesId);
    expect(sales).toMatchObject({ roleId: roles[RoleKey.SalesUser], roleKey: 'SALES_USER', roleNameEn: 'Sales User' });
  });
  it('FR-AUD-04 a failed audit write rolls back the reassignment and the deactivation together', async () => {
    const clientId = `c-useradmin-${randomUUID()}`;
    await prisma.client.create({
      data: { id: clientId, tenantId, name: 'Rollback Co', assignedUserId: salesId, lastUpdatedByUserId: adminId, customFieldValues: {} },
    });
    const failingAudit = new PrismaUserAdminTransaction(prisma, () => ({
      record: async () => {
        throw new Error('audit write failed');
      },
    }));
    const useCase = new DeactivateUserUseCase(
      new PrismaUserRepository(prisma),
      new RoleManagementGuard(new PrismaRoleCatalogue(prisma)),
      failingAudit
    );

    await expect(
      useCase.execute({
        access: administrator({ userId: adminId, tenantId }),
        requestingUserId: adminId,
        tenantId,
        userIdToDeactivate: salesId,
        reassignToUserId: adminId,
      })
    ).rejects.toThrow('audit write failed');

    expect((await prisma.client.findUnique({ where: { id: clientId } }))?.assignedUserId).toBe(salesId);
    expect((await prisma.user.findUnique({ where: { id: salesId } }))?.isActive).toBe(true);
  });
});
