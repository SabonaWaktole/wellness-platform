import { CopyRoleUseCase } from '../../../../src/access/application/use-cases/CopyRoleUseCase';
import { PermissionDeniedError, RoleNameTakenError, RoleNotFoundError } from '../../../../src/access/domain/errors';
import { DEFAULT_ROLE_MATRIX } from '../../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey } from '../../../../src/access/domain/RoleKey';
import { AuditAction } from '../../../../src/audit/domain/AuditAction';
import { administrator, ceo } from '../../../support/access';
import { makeRoleCatalogue, systemRoles } from '../../../support/fakeUserAdmin';
import { makeRoleAdminHarness } from '../../../support/fakeRoleAdmin';

function setup(roles = systemRoles()) {
  const catalogue = makeRoleCatalogue(roles);
  const harness = makeRoleAdminHarness();
  const useCase = new CopyRoleUseCase(catalogue, harness.writeTx, () => '0a1b2c3d-4e5f-6789-abcd-ef0123456789');
  return { catalogue, harness, useCase };
}

const names = { nameSq: 'Shitës i ri', nameEn: 'Junior Sales' };

describe('CopyRoleUseCase', () => {
  it('FR-RBAC-04 creates a custom role with the source role\'s permissions', async () => {
    const { harness, useCase } = setup();

    const role = await useCase.execute({ access: administrator(), tenantId: 'tenant1', sourceRoleId: 'role-SALES_USER', ...names });

    expect(harness.roles.create).toHaveBeenCalledWith('tenant1', {
      id: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
      key: 'CUSTOM_0A1B2C3D4E5F',
      baseKey: RoleKey.SalesUser,
      nameSq: 'Shitës i ri',
      nameEn: 'Junior Sales',
      grants: DEFAULT_ROLE_MATRIX[RoleKey.SalesUser],
    });
    expect(role).toMatchObject({ id: '0a1b2c3d-4e5f-6789-abcd-ef0123456789', isSystem: false, baseKey: RoleKey.SalesUser });
  });

  it('FR-RBAC-04 a copy of a copy still descends from the system role', async () => {
    const custom = {
      id: 'role-custom',
      key: 'CUSTOM_AAAA',
      nameSq: 'Recepsion natën',
      nameEn: 'Night reception',
      isSystem: false,
      baseKey: RoleKey.Reception,
      grants: { 'companies.view': DEFAULT_ROLE_MATRIX[RoleKey.Reception]['companies.view'] },
    };
    const { harness, useCase } = setup([...systemRoles(), custom]);

    await useCase.execute({ access: administrator(), tenantId: 'tenant1', sourceRoleId: 'role-custom', ...names });

    expect(harness.roles.create).toHaveBeenCalledWith('tenant1', expect.objectContaining({ baseKey: RoleKey.Reception, grants: custom.grants }));
  });

  it('FR-RBAC-10 audits the new role with its name, source and permission set', async () => {
    const { harness, useCase } = setup();

    await useCase.execute({ access: administrator({ userId: 'admin' }), tenantId: 'tenant1', sourceRoleId: 'role-SALES_USER', ...names });

    const [entry] = harness.recordedAuditEntries();
    expect(entry).toMatchObject({ userId: 'admin', action: AuditAction.Create, entityType: 'Role', entityLabel: 'Shitës i ri' });
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'nameSq', old: null, new: 'Shitës i ri' },
        { field: 'nameEn', old: null, new: 'Junior Sales' },
        { field: 'copiedFrom', old: null, new: 'Përdorues Shitjesh' },
        expect.objectContaining({ field: 'permissions', old: null }),
      ])
    );
  });

  it('trims the names it is given', async () => {
    const { harness, useCase } = setup();

    await useCase.execute({ access: administrator(), tenantId: 'tenant1', sourceRoleId: 'role-SALES_USER', nameSq: '  Shitës i ri ', nameEn: ' Junior Sales' });

    expect(harness.roles.create).toHaveBeenCalledWith('tenant1', expect.objectContaining(names));
  });

  it('refuses a name another role already has, in either language and any case', async () => {
    const { harness, useCase } = setup();

    await expect(
      useCase.execute({ access: administrator(), tenantId: 'tenant1', sourceRoleId: 'role-SALES_USER', nameSq: 'Tjetër', nameEn: 'reception' })
    ).rejects.toBeInstanceOf(RoleNameTakenError);
    expect(harness.roles.create).not.toHaveBeenCalled();
  });

  it('refuses a source role of another workspace', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ access: administrator(), tenantId: 'other-tenant', sourceRoleId: 'role-SALES_USER', ...names })
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('FR-RBAC-05 refuses a caller without roles.manage', async () => {
    const { useCase } = setup();

    await expect(
      useCase.execute({ access: ceo(), tenantId: 'tenant1', sourceRoleId: 'role-SALES_USER', ...names })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
