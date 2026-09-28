import { ReactivateUserUseCase } from '@auth/application/use-cases/ReactivateUserUseCase';
import { administrator, salesUser } from '../../../../support/access';
import { makeUser, makeUserRepository } from '../../../../support/fakeUserAdmin';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';

describe('ReactivateUserUseCase', () => {
  const setup = (users = [makeUser({ isActive: false })]) => {
    const harness = makeUserAdminHarness();
    const permissionsChanged = { userChanged: jest.fn(), tenantChanged: jest.fn() };
    const useCase = new ReactivateUserUseCase(makeUserRepository(users), harness.writeTx, permissionsChanged);
    const execute = (over: Record<string, unknown> = {}) =>
      useCase.execute({
        access: administrator({ userId: 'admin', tenantId: 'tenant1' }),
        tenantId: 'tenant1',
        userIdToReactivate: 'u1',
        ...over,
      });
    return { harness, permissionsChanged, execute };
  };

  it('reactivates a deactivated staff member', async () => {
    const { harness, execute } = setup();

    await expect(execute()).resolves.toEqual({ userId: 'u1' });
    expect(harness.staff.setActive).toHaveBeenCalledWith('tenant1', 'u1', true);
  });

  it('FR-USR-06 audits the reactivation', async () => {
    const { harness, execute } = setup();

    await execute();

    expect(harness.recordedAuditEntries()).toEqual([
      {
        tenantId: 'tenant1',
        userId: 'admin',
        userRole: 'ADMINISTRATOR',
        action: AuditAction.StatusChange,
        entityType: 'User',
        entityId: 'u1',
        entityLabel: 'staff@tenant1.test',
        changes: [{ field: 'isActive', old: false, new: true }],
      },
    ]);
  });

  it('D1: clears the access cache for the reactivated user', async () => {
    const { permissionsChanged, execute } = setup();
    await execute();
    expect(permissionsChanged.userChanged).toHaveBeenCalledWith('u1');
  });

  it('is idempotent: reactivating an active member succeeds and writes nothing', async () => {
    const { harness, execute } = setup([makeUser({ isActive: true })]);

    await expect(execute()).resolves.toEqual({ userId: 'u1' });
    expect(harness.staff.setActive).not.toHaveBeenCalled();
    expect(harness.auditTrail.record).not.toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses a caller without users.manage', async () => {
    const { harness, execute } = setup();
    await expect(execute({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(harness.staff.setActive).not.toHaveBeenCalled();
  });

  it('reports a user of another tenant as not found', async () => {
    const { harness, execute } = setup([makeUser({ isActive: false, tenantId: 'other' })]);
    await expect(execute()).rejects.toThrow('User not found.');
    expect(harness.staff.setActive).not.toHaveBeenCalled();
  });

  it('reports a missing user rather than silently succeeding', async () => {
    const { execute } = setup([]);
    await expect(execute()).rejects.toThrow('User not found.');
  });
});
