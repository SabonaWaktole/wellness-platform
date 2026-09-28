import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaAccessRepository } from '../../../src/access/infrastructure/PrismaAccessRepository';
import { PermissionScope } from '../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../src/access/domain/RoleKey';

const prisma = new PrismaClient();

describe('PrismaAccessRepository (Slice 3)', () => {
  const tenantId = `t-access-${randomUUID()}`;
  const otherTenantId = `t-access-other-${randomUUID()}`;
  const roleId = `role-access-${randomUUID()}`;
  const userWithRoleId = `u-access-role-${randomUUID()}`;
  const userWithoutRoleId = `u-access-legacy-${randomUUID()}`;
  let repository: PrismaAccessRepository;

  beforeAll(async () => {
    repository = new PrismaAccessRepository(prisma);

    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: 'Access Tenant', urlSlug: tenantId },
        { id: otherTenantId, name: 'Other Access Tenant', urlSlug: otherTenantId },
      ],
    });

    await prisma.role.create({
      data: {
        id: roleId,
        tenantId,
        key: RoleKey.SalesManager,
        nameSq: 'Menaxher Shitjesh',
        nameEn: 'Sales Manager',
        isSystem: true,
        updatedAt: new Date(),
        permissions: {
          createMany: {
            data: [
              { permissionKey: 'companies.view', scope: PermissionScope.Team },
              { permissionKey: 'users.manage', scope: null },
            ],
          },
        },
      },
    });

    await prisma.user.createMany({
      data: [
        {
          id: userWithRoleId,
          email: `${userWithRoleId}@example.com`,
          hashedPassword: 'pwd',
          role: 'BUSINESS_OWNER',
          roleId,
          tenantId,
        },
        {
          id: userWithoutRoleId,
          email: `${userWithoutRoleId}@example.com`,
          hashedPassword: 'pwd',
          role: 'STAFF',
          tenantId,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.role.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('returns null for a user that does not exist in that tenant', async () => {
    const record = await repository.findAccessRecord(tenantId, 'nonexistent-user');
    expect(record).toBeNull();
  });

  it('FR-RBAC-01: tenant isolation — a user is not found under the wrong tenant', async () => {
    const record = await repository.findAccessRecord(otherTenantId, userWithRoleId);
    expect(record).toBeNull();
  });

  it('loads a role-carrying user with its grants, scoped and unscoped', async () => {
    const record = await repository.findAccessRecord(tenantId, userWithRoleId);

    expect(record).not.toBeNull();
    expect(record!.roleId).toBe(roleId);
    expect(record!.roleKey).toBe(RoleKey.SalesManager);
    expect(record!.isActive).toBe(true);
    expect(record!.grants).toEqual({
      'companies.view': PermissionScope.Team,
      'users.manage': true,
    });
  });

  it('loads a legacy user (no roleId) with empty grants and the legacy role string', async () => {
    const record = await repository.findAccessRecord(tenantId, userWithoutRoleId);

    expect(record).not.toBeNull();
    expect(record!.roleId).toBeNull();
    expect(record!.roleKey).toBeNull();
    expect(record!.legacyRole).toBe('STAFF');
    expect(record!.isActive).toBe(false);
    expect(record!.grants).toEqual({});
  });
});
