import { randomUUID } from 'crypto';
import { AccessContext } from '../../domain/AccessContext';
import { lineageKeyOf } from '../../domain/RoleKey';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IRoleAdminTransaction, NewRole } from '../ports/IRoleAdminTransaction';
import { IRoleCatalogue, RoleSummary } from '../ports/IRoleCatalogue';
import { auditActor, ensureNameFree, findRole, roleAuditLabel, RoleNames, trimNames } from '../roleAdmin';

/**
 * Creates a custom role as a copy of an existing one (FR-RBAC-04). The copy
 * starts with the source's permissions and is edited like any role from then
 * on. It remembers the system role it descends from, so a copy of Sales User
 * still counts as a Sales User for Team scope.
 */
export class CopyRoleUseCase {
  constructor(
    private readonly roles: IRoleCatalogue,
    private readonly writeTx: IRoleAdminTransaction,
    private readonly newId: () => string = randomUUID
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; sourceRoleId: string } & RoleNames): Promise<RoleSummary> {
    input.access.ensure('roles.manage');

    const source = await findRole(this.roles, input.tenantId, input.sourceRoleId);
    const names = trimNames(input);
    await ensureNameFree(this.roles, input.tenantId, names);

    const id = this.newId();
    const role: NewRole = {
      id,
      key: `CUSTOM_${id.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      baseKey: lineageKeyOf(source),
      ...names,
      grants: source.grants,
    };

    await this.writeTx.run(async ({ roles, auditTrail }) => {
      await roles.create(input.tenantId, role);
      await auditTrail.record({
        ...auditActor(input.access, input.tenantId),
        action: AuditAction.Create,
        entityType: 'Role',
        entityId: id,
        entityLabel: roleAuditLabel(names),
        changes: [
          { field: 'nameSq', old: null, new: names.nameSq },
          { field: 'nameEn', old: null, new: names.nameEn },
          { field: 'copiedFrom', old: null, new: roleAuditLabel(source) },
          { field: 'permissions', old: null, new: Object.fromEntries(Object.entries(role.grants).sort()) },
        ],
      });
    });

    return { ...role, isSystem: false };
  }
}
