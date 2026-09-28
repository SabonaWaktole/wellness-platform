import { AccessContext } from '../../domain/AccessContext';
import { PERMISSION_CATALOGUE } from '../../domain/PermissionCatalogue';
import { IRoleCatalogue } from '../ports/IRoleCatalogue';

/**
 * Everything the Roles & permissions screen draws (FR-RBAC-03): the in-code
 * catalogue, grouped and milestone-tagged, and every role with its grants and
 * the number of users holding it.
 */
export class ListRolePermissionsUseCase {
  constructor(private readonly roles: IRoleCatalogue) {}

  async execute(input: { access: AccessContext; tenantId: string }) {
    input.access.ensure('roles.manage');

    const roles = await this.roles.list(input.tenantId);
    const withUsage = await Promise.all(
      roles.map(async (role) => ({ ...role, users: (await this.roles.usage(input.tenantId, role.id)).users }))
    );
    return { catalogue: PERMISSION_CATALOGUE, roles: withUsage };
  }
}
