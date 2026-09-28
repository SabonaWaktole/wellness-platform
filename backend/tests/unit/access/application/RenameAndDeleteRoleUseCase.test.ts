import { RenameRoleUseCase } from '../../../../src/access/application/use-cases/RenameRoleUseCase';
import { DeleteCustomRoleUseCase } from '../../../../src/access/application/use-cases/DeleteCustomRoleUseCase';
import { ListRolePermissionsUseCase } from '../../../../src/access/application/use-cases/ListRolePermissionsUseCase';
import {
  PermissionDeniedError,
  RoleInUseError,
  RoleNameTakenError,
  RoleNotFoundError,
  SystemRoleLockedError,
} from '../../../../src/access/domain/errors';
import { PermissionScope } from '../../../../src/access/domain/PermissionScope';
import { RoleKey } from '../../../../src/access/domain/RoleKey';
import { PERMISSION_CATALOGUE } from '../../../../src/access/domain/PermissionCatalogue';
import { AuditAction } from '../../../../src/audit/domain/AuditAction';
import { administrator, ceo } from '../../../support/access';
import { makeRoleCatalogue, systemRoles } from '../../../support/fakeUserAdmin';
import { makeRoleAdminHarness } from '../../../support/fakeRoleAdmin';

const custom = {
  id: 'role-custom',
  key: 'CUSTOM_AAAA',
  nameSq: 'Recepsion natën',
  nameEn: 'Night reception',
  isSystem: false,
  baseKey: RoleKey.Reception,
  grants: { 'companies.view': PermissionScope.All },
};

function setup() {
  const catalogue = makeRoleCatalogue([...systemRoles(), custom]);
  const harness = makeRoleAdminHarness();
  return { catalogue, harness };
}

describe('RenameRoleUseCase', () => {
  const rename = (tenantId = 'tenant1', roleId = 'role-custom', nameSq = 'Recepsion mbrëmje', nameEn = 'Evening reception') => {
    const { catalogue, harness } = setup();
    const useCase = new RenameRoleUseCase(catalogue, harness.writeTx);
    return { harness, run: (access = administrator({ userId: 'admin' })) => useCase.execute({ access, tenantId, roleId, nameSq, nameEn }) };
  };

  it('renames a custom role and audits the old and new names', async () => {
    const { harness, run } = rename();

    await run();

    expect(harness.roles.rename).toHaveBeenCalledWith('tenant1', 'role-custom', { nameSq: 'Recepsion mbrëmje', nameEn: 'Evening reception' });
    const [entry] = harness.recordedAuditEntries();
    expect(entry).toMatchObject({ action: AuditAction.Update, entityType: 'Role', entityId: 'role-custom', entityLabel: 'Recepsion mbrëmje' });
    expect(entry.changes).toEqual([
      { field: 'nameSq', old: 'Recepsion natën', new: 'Recepsion mbrëmje' },
      { field: 'nameEn', old: 'Night reception', new: 'Evening reception' },
    ]);
  });

  it('keeps its own name without calling it taken', async () => {
    const { harness, run } = rename('tenant1', 'role-custom', 'Recepsion natën', 'Night Reception');

    await run();

    expect(harness.roles.rename).toHaveBeenCalled();
  });

  it('refuses a name another role has', async () => {
    const { harness, run } = rename('tenant1', 'role-custom', 'CEO', 'Chief');

    await expect(run()).rejects.toBeInstanceOf(RoleNameTakenError);
    expect(harness.roles.rename).not.toHaveBeenCalled();
  });

  it('FR-RBAC-01 refuses to rename a system role', async () => {
    const { harness, run } = rename('tenant1', 'role-RECEPTION');

    await expect(run()).rejects.toBeInstanceOf(SystemRoleLockedError);
    expect(harness.roles.rename).not.toHaveBeenCalled();
  });

  it('refuses a role of another workspace', async () => {
    await expect(rename('other-tenant').run()).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('FR-RBAC-05 refuses a caller without roles.manage', async () => {
    await expect(rename().run(ceo())).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe('DeleteCustomRoleUseCase', () => {
  const remove = (roleId = 'role-custom', usage = { users: 0, invitations: 0 }, tenantId = 'tenant1') => {
    const { catalogue, harness } = setup();
    catalogue.usage.mockResolvedValue(usage);
    const useCase = new DeleteCustomRoleUseCase(catalogue, harness.writeTx);
    return { catalogue, harness, run: (access = administrator({ userId: 'admin' })) => useCase.execute({ access, tenantId, roleId }) };
  };

  it('deletes a custom role no one holds, and audits what it granted', async () => {
    const { harness, run } = remove();

    await run();

    expect(harness.roles.delete).toHaveBeenCalledWith('tenant1', 'role-custom');
    const [entry] = harness.recordedAuditEntries();
    expect(entry).toMatchObject({ action: AuditAction.Delete, entityType: 'Role', entityId: 'role-custom', entityLabel: 'Recepsion natën' });
    expect(entry.changes).toContainEqual({ field: 'permissions', old: { 'companies.view': 'ALL' }, new: null });
  });

  it('refuses while users hold the role, and deletes nothing', async () => {
    const { catalogue, harness, run } = remove('role-custom', { users: 2, invitations: 0 });

    await expect(run()).rejects.toEqual(expect.objectContaining({ users: 2, invitations: 0 }));
    await expect(run()).rejects.toBeInstanceOf(RoleInUseError);
    expect(catalogue.usage).toHaveBeenCalledWith('tenant1', 'role-custom');
    expect(harness.roles.delete).not.toHaveBeenCalled();
  });

  it('refuses while a pending invitation carries the role', async () => {
    await expect(remove('role-custom', { users: 0, invitations: 1 }).run()).rejects.toBeInstanceOf(RoleInUseError);
  });

  it('FR-RBAC-01 refuses to delete a system role', async () => {
    const { harness, run } = remove('role-RECEPTION');

    await expect(run()).rejects.toBeInstanceOf(SystemRoleLockedError);
    expect(harness.roles.delete).not.toHaveBeenCalled();
  });

  it('refuses a role of another workspace', async () => {
    await expect(remove('role-custom', undefined, 'other-tenant').run()).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('FR-RBAC-05 refuses a caller without roles.manage', async () => {
    await expect(remove().run(ceo())).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe('ListRolePermissionsUseCase', () => {
  it('FR-RBAC-03 lists every role with its grants and how many users hold it, alongside the catalogue', async () => {
    const { catalogue } = setup();
    catalogue.usage.mockImplementation(async (_tenantId, roleId) => ({ users: roleId === 'role-custom' ? 3 : 0, invitations: 0 }));

    const result = await new ListRolePermissionsUseCase(catalogue).execute({ access: administrator(), tenantId: 'tenant1' });

    expect(result.catalogue).toEqual(PERMISSION_CATALOGUE);
    expect(result.roles).toHaveLength(6);
    expect(result.roles).toContainEqual({ ...custom, users: 3 });
  });

  it('FR-RBAC-05 refuses a caller without roles.manage', async () => {
    await expect(
      new ListRolePermissionsUseCase(makeRoleCatalogue()).execute({ access: ceo(), tenantId: 'tenant1' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
