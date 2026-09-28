import { UpdateUserRoleUseCase } from '@auth/application/use-cases/UpdateUserRoleUseCase';
import { UserRole } from '@auth/domain/enums/UserRole';
import { UnauthorizedError, UnknownRoleError } from '@auth/domain/errors';
import { administrator, salesUser } from '../../../../support/access';
import { makeRoleCatalogue, makeUser, makeUserRepository, systemRoles } from '../../../../support/fakeUserAdmin';
import { RoleSummary } from '../../../../../src/access/application/ports/IRoleCatalogue';
import { DEFAULT_ROLE_MATRIX } from '../../../../../src/access/domain/DefaultRoleMatrix';
import { RoleKey } from '../../../../../src/access/domain/RoleKey';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';
import { LastRoleManagerError, PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { RoleManagementGuard } from '../../../../../src/access/application/RoleManagementGuard';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';

describe('UpdateUserRoleUseCase', () => {
  const setup = (options: { users?: ReturnType<typeof makeUser>[]; roleManagers?: string[]; roles?: RoleSummary[] } = {}) => {
    const userRepository = makeUserRepository(options.users ?? [makeUser()]);
    const roles = makeRoleCatalogue(options.roles, options.roleManagers);
    const harness = makeUserAdminHarness();
    const permissionsChanged = { userChanged: jest.fn(), tenantChanged: jest.fn() };
    const useCase = new UpdateUserRoleUseCase(
      userRepository,
      roles,
      new RoleManagementGuard(roles),
      harness.writeTx,
      permissionsChanged
    );
    const execute = (over: Record<string, unknown> = {}) =>
      useCase.execute({
        access: administrator({ userId: 'admin', tenantId: 'tenant1' }),
        tenantId: 'tenant1',
        userIdToUpdate: 'u1',
        newRoleId: 'role-SALES_MANAGER',
        newWarehouseId: null,
        ...over,
      });
    return { harness, permissionsChanged, execute };
  };

  it('FR-RBAC-05 refuses a caller without users.manage', async () => {
    const { harness, execute } = setup();
    await expect(execute({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(harness.staff.setRole).not.toHaveBeenCalled();
  });

  it('FR-RBAC-04 a custom role copied from Administrator writes the Administrator\'s legacy role string', async () => {
    const deputy: RoleSummary = {
      id: 'role-deputy',
      key: 'CUSTOM_DEPUTY',
      nameSq: 'Zëvendës',
      nameEn: 'Deputy',
      isSystem: false,
      baseKey: RoleKey.Administrator,
      grants: DEFAULT_ROLE_MATRIX[RoleKey.Administrator],
    };
    const { harness, execute } = setup({ roles: [...systemRoles(), deputy] });

    await execute({ newRoleId: 'role-deputy' });

    expect(harness.staff.setRole).toHaveBeenCalledWith('tenant1', 'u1', expect.objectContaining({ roleId: 'role-deputy', legacyRole: UserRole.BUSINESS_OWNER }));
  });

  it('refuses a user outside the caller\'s tenant', async () => {
    const { execute } = setup({ users: [makeUser({ tenantId: 'other-tenant' })] });
    await expect(execute()).rejects.toThrow(UnauthorizedError);
  });

  it('refuses a role that is not one of this workspace\'s', async () => {
    const { harness, execute } = setup();
    await expect(execute({ newRoleId: 'role-from-elsewhere' })).rejects.toThrow(UnknownRoleError);
    expect(harness.staff.setRole).not.toHaveBeenCalled();
  });

  it('FR-USR-03 writes the new roleId with its legacy role string and warehouse', async () => {
    const { harness, execute } = setup();

    await execute({ newRoleId: 'role-ADMINISTRATOR', newWarehouseId: 'wh-1' });

    expect(harness.staff.setRole).toHaveBeenCalledWith('tenant1', 'u1', {
      roleId: 'role-ADMINISTRATOR',
      legacyRole: UserRole.BUSINESS_OWNER,
      warehouseId: 'wh-1',
    });
  });

  it('FR-USR-06 audits the role change with the old and new role', async () => {
    const { harness, execute } = setup();

    await execute();

    const [entry] = harness.recordedAuditEntries();
    expect(entry).toMatchObject({
      tenantId: 'tenant1',
      userId: 'admin',
      userRole: 'ADMINISTRATOR',
      action: AuditAction.Update,
      entityType: 'User',
      entityId: 'u1',
      entityLabel: 'staff@tenant1.test',
    });
    expect(entry.changes).toEqual([{ field: 'role', old: 'SALES_USER', new: 'SALES_MANAGER' }]);
  });

  it('reads a legacy user\'s old role through D2 when they have no roleId yet', async () => {
    const { harness, execute } = setup({ users: [makeUser({ roleId: null, role: UserRole.BUSINESS_OWNER })] });

    await execute({ newRoleId: 'role-CEO' });

    expect(harness.recordedAuditEntries()[0].changes).toEqual([{ field: 'role', old: 'ADMINISTRATOR', new: 'CEO' }]);
  });

  it('FR-USR-03 clears the access cache so the next request uses the new role', async () => {
    const { permissionsChanged, execute } = setup();
    await execute();
    expect(permissionsChanged.userChanged).toHaveBeenCalledWith('u1');
  });

  it('FR-RBAC-08 refuses to move the last role manager to a role without roles.manage', async () => {
    const { harness, execute } = setup({
      users: [makeUser({ id: 'admin', roleId: 'role-ADMINISTRATOR' })],
      roleManagers: ['admin'],
    });

    await expect(execute({ userIdToUpdate: 'admin', newRoleId: 'role-CEO' })).rejects.toThrow(LastRoleManagerError);
    expect(harness.staff.setRole).not.toHaveBeenCalled();
  });

  it('lets the last role manager keep a role that still has roles.manage', async () => {
    const { harness, execute } = setup({
      users: [makeUser({ id: 'admin', roleId: 'role-ADMINISTRATOR' })],
      roleManagers: ['admin'],
    });

    await execute({ userIdToUpdate: 'admin', newRoleId: 'role-ADMINISTRATOR', newWarehouseId: 'wh-2' });

    expect(harness.staff.setRole).toHaveBeenCalled();
  });

  it('FR-AUD-04 leaves the cache alone when the audited write fails', async () => {
    const { harness, permissionsChanged, execute } = setup();
    harness.auditTrail.record.mockRejectedValue(new Error('audit write failed'));

    await expect(execute()).rejects.toThrow('audit write failed');
    expect(permissionsChanged.userChanged).not.toHaveBeenCalled();
  });
});
