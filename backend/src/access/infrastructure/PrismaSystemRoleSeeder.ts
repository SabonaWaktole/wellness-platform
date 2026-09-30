import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ISystemRoleSeeder } from '../application/ports/ISystemRoleSeeder';
import { DEFAULT_ROLE_MATRIX } from '../domain/DefaultRoleMatrix';
import { PermissionScope } from '../domain/PermissionScope';
import { PERMISSION_UPGRADES } from '../domain/PermissionUpgrades';
import { RoleKey, SYSTEM_ROLE_NAMES } from '../domain/RoleKey';

export class PrismaSystemRoleSeeder implements ISystemRoleSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(tenantId: string): Promise<Record<RoleKey, string>> {
    const ids = {} as Record<RoleKey, string>;
    for (const roleKey of Object.values(RoleKey)) {
      const id = randomUUID();
      ids[roleKey] = id;
      await this.prisma.role.create({
        data: {
          id,
          tenantId,
          key: roleKey,
          nameSq: SYSTEM_ROLE_NAMES[roleKey].nameSq,
          nameEn: SYSTEM_ROLE_NAMES[roleKey].nameEn,
          isSystem: true,
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
    // Born with the full matrix, so no permission upgrade may run for it later (D7).
    await this.prisma.appliedPermissionUpgrade.createMany({
      data: PERMISSION_UPGRADES.map(({ key }) => ({ tenantId, key })),
    });
    return ids;
  }
}
