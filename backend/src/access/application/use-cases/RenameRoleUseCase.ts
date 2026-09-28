import { AccessContext } from '../../domain/AccessContext';
import { SystemRoleLockedError } from '../../domain/errors';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { IRoleAdminTransaction } from '../ports/IRoleAdminTransaction';
import { IRoleCatalogue } from '../ports/IRoleCatalogue';
import { auditActor, ensureNameFree, findRole, roleAuditLabel, RoleNames, trimNames } from '../roleAdmin';

/** Renames a custom role. System roles keep the names FR-RBAC-01 gives them. */
export class RenameRoleUseCase {
  constructor(
    private readonly roles: IRoleCatalogue,
    private readonly writeTx: IRoleAdminTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; roleId: string } & RoleNames): Promise<void> {
    input.access.ensure('roles.manage');

    const role = await findRole(this.roles, input.tenantId, input.roleId);
    if (role.isSystem) {
      throw new SystemRoleLockedError();
    }
    const names = trimNames(input);
    await ensureNameFree(this.roles, input.tenantId, names, role.id);

    const changes = diff({ nameSq: role.nameSq, nameEn: role.nameEn }, { ...names }, ['nameSq', 'nameEn']);
    if (changes.length === 0) {
      return;
    }

    await this.writeTx.run(async ({ roles, auditTrail }) => {
      await roles.rename(input.tenantId, role.id, names);
      await auditTrail.record({
        ...auditActor(input.access, input.tenantId),
        action: AuditAction.Update,
        entityType: 'Role',
        entityId: role.id,
        entityLabel: roleAuditLabel(names),
        changes,
      });
    });
  }
}
