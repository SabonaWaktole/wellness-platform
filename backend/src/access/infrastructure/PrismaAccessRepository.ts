import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { AccessRecord, IAccessRepository } from '../application/ports/IAccessRepository';
import { PermissionGrant } from '../domain/DefaultRoleMatrix';
import { PermissionScope } from '../domain/PermissionScope';

export class PrismaAccessRepository implements IAccessRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findAccessRecord(tenantId: string, userId: string): Promise<AccessRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: { assignedRole: { include: { permissions: true } } },
    });
    if (!user) {
      return null;
    }

    const grants: Record<string, PermissionGrant> = {};
    for (const permission of user.assignedRole?.permissions ?? []) {
      grants[permission.permissionKey] = permission.scope ? (permission.scope as PermissionScope) : true;
    }

    return {
      userId: user.id,
      tenantId,
      legacyRole: user.role,
      roleId: user.roleId,
      roleKey: user.assignedRole?.key ?? null,
      isActive: user.isActive,
      deletedAt: user.deletedAt,
      grants,
    };
  }
}
