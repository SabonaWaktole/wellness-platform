import { IRoleCatalogue } from './ports/IRoleCatalogue';
import { LastRoleManagerError } from '../domain/errors';

const ROLE_MANAGEMENT = 'roles.manage';

/**
 * FR-RBAC-08: a workspace always keeps at least one active user who can
 * manage roles. Called before any change that takes `roles.manage` away from
 * a user — deactivating them, or moving them to a role without it.
 */
export class RoleManagementGuard {
  constructor(private readonly roles: Pick<IRoleCatalogue, 'activeHolderIds'>) {}

  async ensureNotLastManager(tenantId: string, userId: string): Promise<void> {
    const holders = await this.roles.activeHolderIds(tenantId, ROLE_MANAGEMENT);
    if (holders.length === 1 && holders[0] === userId) {
      throw new LastRoleManagerError();
    }
  }
}
