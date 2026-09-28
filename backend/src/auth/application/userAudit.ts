import { User } from '../domain/entities/User';
import { IRoleCatalogue, RoleSummary } from '../../access/application/ports/IRoleCatalogue';
import { legacyRoleKeyFor } from '../../access/domain/LegacyRoleMapping';
import { UnknownRoleError } from '../domain/errors';

/** How a user is named in the audit log: their name, or their email when they have none. */
export function userLabel(user: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}

/** The key of the role a user holds now: their role row, or D2's mapping when they have no roleId yet. */
export async function currentRoleKey(user: User, roles: IRoleCatalogue): Promise<string | null> {
  if (user.roleId && user.tenantId) {
    const role = await roles.findById(user.tenantId, user.roleId);
    if (role) return role.key;
  }
  return legacyRoleKeyFor(user.role);
}

/** The workspace role `roleId` names, or `UnknownRoleError` when it is not one of this tenant's. */
export async function roleInTenant(roles: IRoleCatalogue, tenantId: string, roleId: string): Promise<RoleSummary> {
  const role = await roles.findById(tenantId, roleId);
  if (!role) {
    throw new UnknownRoleError();
  }
  return role;
}
