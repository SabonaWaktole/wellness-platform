import { AccessContext } from '../domain/AccessContext';
import { RoleNameTakenError, RoleNotFoundError } from '../domain/errors';
import { IRoleCatalogue, RoleSummary } from './ports/IRoleCatalogue';

export interface RoleNames {
  nameSq: string;
  nameEn: string;
}

/** `roleId` among this workspace's roles, or `RoleNotFoundError`. */
export async function findRole(roles: IRoleCatalogue, tenantId: string, roleId: string): Promise<RoleSummary> {
  const role = await roles.findById(tenantId, roleId);
  if (!role) {
    throw new RoleNotFoundError();
  }
  return role;
}

export function trimNames(names: RoleNames): RoleNames {
  return { nameSq: names.nameSq.trim(), nameEn: names.nameEn.trim() };
}

/**
 * Two roles with the same name would be indistinguishable in the role picker.
 * Compared case-insensitively and across both languages; `exceptRoleId` is the
 * role being renamed, which may keep its own name.
 */
export async function ensureNameFree(
  roles: IRoleCatalogue,
  tenantId: string,
  names: RoleNames,
  exceptRoleId?: string
): Promise<void> {
  const wanted = new Set([names.nameSq, names.nameEn].map((name) => name.toLocaleLowerCase()));
  const existing = await roles.list(tenantId);
  const clash = existing.some(
    (role) =>
      role.id !== exceptRoleId &&
      [role.nameSq, role.nameEn].some((name) => wanted.has(name.toLocaleLowerCase()))
  );
  if (clash) {
    throw new RoleNameTakenError();
  }
}

/** Who the audit entry names as having made the change. */
export function auditActor(access: AccessContext, tenantId: string) {
  return { tenantId, userId: access.userId, userRole: access.auditRole };
}

/** How a role is named in the audit log: its Albanian name, the workspace's default language. */
export const roleAuditLabel = (role: RoleNames) => role.nameSq || role.nameEn;
