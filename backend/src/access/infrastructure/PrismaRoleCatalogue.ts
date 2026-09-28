import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IRoleCatalogue, RoleSummary } from '../application/ports/IRoleCatalogue';
import { DEFAULT_ROLE_MATRIX, PermissionGrant } from '../domain/DefaultRoleMatrix';
import { legacyRoleKeyFor } from '../domain/LegacyRoleMapping';
import { PermissionScope } from '../domain/PermissionScope';

const LEGACY_ROLES = ['BUSINESS_OWNER', 'STAFF'] as const;

type RoleRow = {
  id: string;
  key: string;
  nameSq: string;
  nameEn: string;
  isSystem: boolean;
  permissions: Array<{ permissionKey: string; scope: string | null }>;
};

function toSummary(role: RoleRow): RoleSummary {
  const grants: Record<string, PermissionGrant> = {};
  for (const permission of role.permissions) {
    grants[permission.permissionKey] = permission.scope ? (permission.scope as PermissionScope) : true;
  }
  return { id: role.id, key: role.key, nameSq: role.nameSq, nameEn: role.nameEn, isSystem: role.isSystem, grants };
}

export class PrismaRoleCatalogue implements IRoleCatalogue {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async list(tenantId: string): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: { permissions: true },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map(toSummary);
  }

  async findById(tenantId: string, roleId: string): Promise<RoleSummary | null> {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId }, include: { permissions: true } });
    return role ? toSummary(role) : null;
  }

  async activeHolderIds(tenantId: string, permissionKey: string): Promise<string[]> {
    const legacyHolders = LEGACY_ROLES.filter((legacy) => {
      const key = legacyRoleKeyFor(legacy);
      return key !== null && DEFAULT_ROLE_MATRIX[key][permissionKey] !== undefined;
    });
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { assignedRole: { permissions: { some: { permissionKey } } } },
          { roleId: null, role: { in: [...legacyHolders] } },
        ],
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }
}
