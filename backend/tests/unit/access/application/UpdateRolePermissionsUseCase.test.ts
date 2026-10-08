import { UpdateRolePermissionsUseCase } from '../../../../src/access/application/use-cases/UpdateRolePermissionsUseCase';
import { RoleManagementGuard } from '../../../../src/access/application/RoleManagementGuard';
import {
  InvalidPermissionGrantError,
  LastRoleManagerError,
  PermissionDeniedError,
  RoleNotFoundError,
} from '../../../../src/access/domain/errors';
import { DEFAULT_ROLE_MATRIX } from '../../../../src/access/domain/DefaultRoleMatrix';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../../src/access/domain/RoleKey';
import { AuditAction } from '../../../../src/audit/domain/AuditAction';
import { administrator, salesManager } from '../../../support/access';
import { makeRoleCatalogue } from '../../../support/fakeUserAdmin';
import { makePermissionsChanged, makeRoleAdminHarness } from '../../../support/fakeRoleAdmin';

const { All } = PermissionScope;

/** A role's default grants as the admin screen submits them. */
const gridOf = (roleKey: RoleKey) =>
  Object.entries(DEFAULT_ROLE_MATRIX[roleKey]).map(([key, grant]) => ({ key, scope: grant === true ? null : grant }));

function setup(roleManagersOutsideRole: string[] = ['second-admin']) {
  const catalogue = makeRoleCatalogue();
  catalogue.activeHolderIds.mockResolvedValue(roleManagersOutsideRole);
  const harness = makeRoleAdminHarness();
  const permissionsChanged = makePermissionsChanged();
  const useCase = new UpdateRolePermissionsUseCase(
    catalogue,
    new RoleManagementGuard(catalogue),
    harness.writeTx,
    permissionsChanged
  );
  return { catalogue, harness, permissionsChanged, useCase };
}

const withoutValidity = gridOf(RoleKey.Reception).filter((row) => row.key !== 'contracts.validity.view');

describe('UpdateRolePermissionsUseCase', () => {
  it('FR-RBAC-03 replaces a role\'s permissions and scopes', async () => {
    const { harness, useCase } = setup();

    await useCase.execute({
      access: administrator(),
      tenantId: 'tenant1',
      roleId: 'role-RECEPTION',
      permissions: withoutValidity,
    });

    expect(harness.roles.replaceGrants).toHaveBeenCalledWith('tenant1', 'role-RECEPTION', {
      'companies.view': All,
      'notes.view': All,
      'notes.add': All,
      'members.verify': true,
    });
  });

  it('FR-RBAC-10 audits one entry per save, listing the permissions removed', async () => {
    const { harness, useCase } = setup();

    await useCase.execute({ access: administrator({ userId: 'admin' }), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity });

    const entries = harness.recordedAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tenantId: 'tenant1',
      userId: 'admin',
      action: AuditAction.Update,
      entityType: 'Role',
      entityId: 'role-RECEPTION',
      entityLabel: 'Recepsion',
    });
    expect(entries[0].changes).toContainEqual({ field: 'permissionsRemoved', old: ['contracts.validity.view'], new: null });
    expect(entries[0].changes).toContainEqual(
      expect.objectContaining({ field: 'permissions', old: expect.objectContaining({ 'contracts.validity.view': 'ALL' }) })
    );
  });

  it('FR-RBAC-03 clears the whole workspace\'s access cache, so holders lose the permission on their next request', async () => {
    const { permissionsChanged, useCase } = setup();

    await useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity });

    expect(permissionsChanged.tenantChanged).toHaveBeenCalledWith('tenant1');
  });

  it('returns the role with its new permissions', async () => {
    const { useCase } = setup();

    const role = await useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity });

    expect(role).toMatchObject({ id: 'role-RECEPTION', key: 'RECEPTION', grants: { 'companies.view': All } });
    expect(role.grants['contracts.validity.view']).toBeUndefined();
  });

  it('writes and audits nothing when the save changes nothing', async () => {
    const { harness, permissionsChanged, useCase } = setup();

    await useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: gridOf(RoleKey.Reception) });

    expect(harness.roles.replaceGrants).not.toHaveBeenCalled();
    expect(harness.auditTrail.record).not.toHaveBeenCalled();
    expect(permissionsChanged.tenantChanged).not.toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses a caller without roles.manage', async () => {
    const { harness, useCase } = setup();

    await expect(
      useCase.execute({ access: salesManager(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(harness.roles.replaceGrants).not.toHaveBeenCalled();
  });

  it('refuses a role of another workspace', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ access: administrator(), tenantId: 'other-tenant', roleId: 'role-RECEPTION', permissions: [] })
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('FR-RBAC-02 refuses a key outside the catalogue, and changes nothing', async () => {
    const { harness, useCase } = setup();

    await expect(
      useCase.execute({
        access: administrator(),
        tenantId: 'tenant1',
        roleId: 'role-RECEPTION',
        permissions: [...withoutValidity, { key: 'companies.teleport', scope: All }],
      })
    ).rejects.toBeInstanceOf(InvalidPermissionGrantError);
    expect(harness.roles.replaceGrants).not.toHaveBeenCalled();
  });

  describe('lock-out protection (FR-RBAC-08)', () => {
    const adminWithoutRolesManage = gridOf(RoleKey.Administrator).filter((row) => row.key !== 'roles.manage');

    it('FR-RBAC-08 refuses to take roles.manage from the only role whose active users hold it, and nothing changes', async () => {
      const { harness, permissionsChanged, useCase } = setup([]);

      await expect(
        useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-ADMINISTRATOR', permissions: adminWithoutRolesManage })
      ).rejects.toBeInstanceOf(LastRoleManagerError);
      expect(harness.roles.replaceGrants).not.toHaveBeenCalled();
      expect(harness.auditTrail.record).not.toHaveBeenCalled();
      expect(permissionsChanged.tenantChanged).not.toHaveBeenCalled();
    });

    it('allows it while someone in another role still holds roles.manage', async () => {
      const { catalogue, harness, useCase } = setup(['custom-admin']);

      await useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-ADMINISTRATOR', permissions: adminWithoutRolesManage });

      expect(catalogue.activeHolderIds).toHaveBeenCalledWith('tenant1', 'roles.manage', { excludingRoleId: 'role-ADMINISTRATOR' });
      expect(harness.roles.replaceGrants).toHaveBeenCalled();
    });

    it('does not ask when roles.manage is kept', async () => {
      const { catalogue, useCase } = setup([]);

      await useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity });

      expect(catalogue.activeHolderIds).not.toHaveBeenCalled();
    });
  });

  it('FR-AUD-04 leaves the cache alone when the audit write fails', async () => {
    const { harness, permissionsChanged, useCase } = setup();
    harness.auditTrail.record.mockRejectedValue(new Error('audit down'));

    await expect(
      useCase.execute({ access: administrator(), tenantId: 'tenant1', roleId: 'role-RECEPTION', permissions: withoutValidity })
    ).rejects.toThrow('audit down');
    expect(permissionsChanged.tenantChanged).not.toHaveBeenCalled();
  });
});
