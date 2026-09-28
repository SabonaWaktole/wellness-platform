import { AccessContext } from '../../domain/AccessContext';
import { GrantInput, permissionSetChanges, toGrantMap } from '../../domain/RoleGrants';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IPermissionsChanged } from '../ports/IPermissionsChanged';
import { IRoleAdminTransaction } from '../ports/IRoleAdminTransaction';
import { IRoleCatalogue, RoleSummary } from '../ports/IRoleCatalogue';
import { RoleManagementGuard } from '../RoleManagementGuard';
import { auditActor, findRole, roleAuditLabel } from '../roleAdmin';

const ROLE_MANAGEMENT = 'roles.manage';

/**
 * Replaces a role's permissions and scopes from the admin screen (FR-RBAC-03).
 * The submitted grid is the whole new set, not a patch. Holders feel the change
 * on their next request, because the workspace's access cache is cleared as
 * soon as the write commits; one audit entry per save lists what was added and
 * removed (FR-RBAC-10).
 */
export class UpdateRolePermissionsUseCase {
  constructor(
    private readonly roles: IRoleCatalogue,
    private readonly guard: RoleManagementGuard,
    private readonly writeTx: IRoleAdminTransaction,
    private readonly permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    roleId: string;
    permissions: GrantInput[];
  }): Promise<RoleSummary> {
    input.access.ensure(ROLE_MANAGEMENT);

    const role = await findRole(this.roles, input.tenantId, input.roleId);
    const grants = toGrantMap(input.permissions);
    const changes = permissionSetChanges(role.grants, grants);
    if (changes.length === 0) {
      return role;
    }

    if (role.grants[ROLE_MANAGEMENT] !== undefined && grants[ROLE_MANAGEMENT] === undefined) {
      await this.guard.ensureRoleKeepsManager(input.tenantId, role.id);
    }

    await this.writeTx.run(async ({ roles, auditTrail }) => {
      await roles.replaceGrants(input.tenantId, role.id, grants);
      await auditTrail.record({
        ...auditActor(input.access, input.tenantId),
        action: AuditAction.Update,
        entityType: 'Role',
        entityId: role.id,
        entityLabel: roleAuditLabel(role),
        changes,
      });
    });
    this.permissionsChanged?.tenantChanged(input.tenantId);

    return { ...role, grants };
  }
}
