import { PrismaClient } from '@prisma/client';
import { RoleKey } from '../../src/access/domain/RoleKey';
import { PrismaSystemRoleSeeder } from '../../src/access/infrastructure/PrismaSystemRoleSeeder';

/**
 * Seeds the five system roles with the §4.2 default matrix for one tenant,
 * exactly as provisioning does. Returns each role's id. Deleted with the
 * tenant (Role cascades on Tenant).
 */
export function seedSystemRoles(prisma: PrismaClient, tenantId: string): Promise<Record<RoleKey, string>> {
  return new PrismaSystemRoleSeeder(prisma).seed(tenantId);
}
