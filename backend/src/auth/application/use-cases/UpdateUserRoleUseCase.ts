import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UnauthorizedError } from '../../domain/errors';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';
import { IRoleCatalogue } from '../../../access/application/ports/IRoleCatalogue';
import { RoleManagementGuard } from '../../../access/application/RoleManagementGuard';
import { legacyRoleFor } from '../../../access/domain/LegacyRoleMapping';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { currentRoleKey, roleInTenant, userLabel } from '../userAudit';

/**
 * Moves a user to another of the workspace's roles (FR-USR-03). The change
 * applies on their next request, because the access cache is cleared as soon
 * as it commits.
 */
export class UpdateUserRoleUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly roles: IRoleCatalogue,
    private readonly guard: RoleManagementGuard,
    private readonly writeTx: IUserAdminTransaction,
    private readonly permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    userIdToUpdate: string;
    newRoleId: string;
    newWarehouseId: string | null;
  }) {
    input.access.ensure('users.manage');

    const user = await this.userRepository.findById(input.userIdToUpdate);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.tenantId !== input.tenantId) {
      throw new UnauthorizedError('User does not belong to this tenant');
    }

    const newRole = await roleInTenant(this.roles, input.tenantId, input.newRoleId);
    if (newRole.grants['roles.manage'] === undefined) {
      await this.guard.ensureNotLastManager(input.tenantId, user.id);
    }

    const before = { role: await currentRoleKey(user, this.roles), warehouseId: user.warehouseId };
    const after = { role: newRole.key, warehouseId: input.newWarehouseId };

    await this.writeTx.run(async ({ staff, auditTrail }) => {
      await staff.setRole(input.tenantId, user.id, {
        roleId: newRole.id,
        legacyRole: legacyRoleFor(newRole.key),
        warehouseId: input.newWarehouseId,
      });
      const changes = diff(before, after, ['role', 'warehouseId']);
      if (changes.length > 0) {
        await auditTrail.record({
          tenantId: input.tenantId,
          userId: input.access.userId,
          userRole: input.access.auditRole,
          action: AuditAction.Update,
          entityType: 'User',
          entityId: user.id,
          entityLabel: userLabel(user),
          changes,
        });
      }
    });
    this.permissionsChanged?.userChanged(user.id);

    return { success: true };
  }
}
