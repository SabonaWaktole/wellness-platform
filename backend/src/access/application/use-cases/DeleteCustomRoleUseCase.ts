import { AccessContext } from '../../domain/AccessContext';
import { RoleInUseError, SystemRoleLockedError } from '../../domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IRoleAdminTransaction } from '../ports/IRoleAdminTransaction';
import { IRoleCatalogue } from '../ports/IRoleCatalogue';
import { auditActor, findRole, roleAuditLabel } from '../roleAdmin';

/**
 * Deletes a custom role no one holds. Refused while any user (active or
 * deactivated) or pending invitation carries it: they would be left with no
 * role, so the Administrator moves them first. System roles are never deleted.
 */
export class DeleteCustomRoleUseCase {
  constructor(
    private readonly roles: IRoleCatalogue,
    private readonly writeTx: IRoleAdminTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; roleId: string }): Promise<void> {
    input.access.ensure('roles.manage');

    const role = await findRole(this.roles, input.tenantId, input.roleId);
    if (role.isSystem) {
      throw new SystemRoleLockedError();
    }
    const usage = await this.roles.usage(input.tenantId, role.id);
    if (usage.users > 0 || usage.invitations > 0) {
      throw new RoleInUseError(usage.users, usage.invitations);
    }

    await this.writeTx.run(async ({ roles, auditTrail }) => {
      await roles.delete(input.tenantId, role.id);
      await auditTrail.record({
        ...auditActor(input.access, input.tenantId),
        action: AuditAction.Delete,
        entityType: 'Role',
        entityId: role.id,
        entityLabel: roleAuditLabel(role),
        changes: [
          { field: 'nameSq', old: role.nameSq, new: null },
          { field: 'nameEn', old: role.nameEn, new: null },
          { field: 'permissions', old: Object.fromEntries(Object.entries(role.grants).sort()), new: null },
        ],
      });
    });
  }
}
