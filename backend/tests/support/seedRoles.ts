import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DEFAULT_ROLE_MATRIX } from '../../src/access/domain/DefaultRoleMatrix';
import { PermissionScope } from '../../src/access/domain/PermissionScope';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../../src/access/domain/RoleKey';

/**
 * Seeds the five system roles with the §4.2 default matrix for one tenant,
 * as the migration does for a real one. Returns each role's id. Deleted with
 * the tenant (Role cascades on Tenant).
 */
export async function seedSystemRoles(prisma: PrismaClient, tenantId: string): Promise<Record<RoleKey, string>> {
  const ids = {} as Record<RoleKey, string>;
  for (const roleKey of Object.values(RoleKey)) {
    const id = `role-${roleKey}-${randomUUID()}`;
    ids[roleKey] = id;
    await prisma.role.create({
      data: {
        id,
        tenantId,
        key: roleKey,
        nameSq: SYSTEM_ROLE_NAMES[roleKey].nameSq,
        nameEn: SYSTEM_ROLE_NAMES[roleKey].nameEn,
        isSystem: true,
        updatedAt: new Date(),
        permissions: {
          createMany: {
            data: Object.entries(DEFAULT_ROLE_MATRIX[roleKey]).map(([permissionKey, grant]) => ({
              permissionKey,
              scope: grant === true ? null : (grant as PermissionScope),
            })),
          },
        },
      },
    });
  }
  return ids;
}
