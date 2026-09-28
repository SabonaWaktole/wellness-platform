import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IRoleAdminTransaction, IRoleWrites, NewRole, RoleAdminRepos } from '../application/ports/IRoleAdminTransaction';
import { RoleGrantMap } from '../domain/DefaultRoleMatrix';
import { PermissionScope } from '../domain/PermissionScope';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';

const permissionRows = (grants: RoleGrantMap) =>
  Object.entries(grants).map(([permissionKey, grant]) => ({
    permissionKey,
    scope: grant === true ? null : (grant as PermissionScope),
  }));

class PrismaRoleWrites implements IRoleWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceGrants(tenantId: string, roleId: string, grants: RoleGrantMap): Promise<void> {
    // RolePermission has no tenantId of its own: the role's tenant is the boundary.
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true } });
    if (!role) {
      return;
    }
    await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await this.prisma.rolePermission.createMany({
      data: permissionRows(grants).map((row) => ({ roleId: role.id, ...row })),
    });
    await this.prisma.role.update({ where: { id: role.id }, data: { updatedAt: new Date() } });
  }

  async create(tenantId: string, role: NewRole): Promise<void> {
    await this.prisma.role.create({
      data: {
        id: role.id,
        tenantId,
        key: role.key,
        baseKey: role.baseKey,
        nameSq: role.nameSq,
        nameEn: role.nameEn,
        isSystem: false,
        permissions: { createMany: { data: permissionRows(role.grants) } },
      },
    });
  }

  async rename(tenantId: string, roleId: string, names: { nameSq: string; nameEn: string }): Promise<void> {
    await this.prisma.role.updateMany({ where: { id: roleId, tenantId, isSystem: false }, data: names });
  }

  async delete(tenantId: string, roleId: string): Promise<void> {
    // RolePermission rows cascade with the role.
    await this.prisma.role.deleteMany({ where: { id: roleId, tenantId, isSystem: false } });
  }
}

export class PrismaRoleAdminTransaction implements IRoleAdminTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // permission change back (FR-AUD-04), as in PrismaUserAdminTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: RoleAdminRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({ roles: new PrismaRoleWrites(client), auditTrail: this.auditTrailFor(client) });
    });
  }
}
