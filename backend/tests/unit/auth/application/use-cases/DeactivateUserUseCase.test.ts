import { DeactivateUserUseCase } from '@auth/application/use-cases/DeactivateUserUseCase';
import { UserRole } from '@auth/domain/enums/UserRole';
import { InvalidReassignmentTargetError, ReassignmentRequiredError } from '@auth/domain/errors';
import { administrator, salesUser } from '../../../../support/access';
import { makeRoleCatalogue, makeUser, makeUserRepository } from '../../../../support/fakeUserAdmin';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';
import { LastRoleManagerError, PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { RoleManagementGuard } from '../../../../../src/access/application/RoleManagementGuard';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';

const leaving = makeUser({ id: 'leaving', email: 'leaving@tenant1.test', firstName: 'Ana', lastName: 'Hoxha' });
const colleague = makeUser({ id: 'colleague', email: 'colleague@tenant1.test' });

describe('DeactivateUserUseCase', () => {
  const setup = (options: { users?: ReturnType<typeof makeUser>[]; companies?: number; roleManagers?: string[] } = {}) => {
    const userRepository = makeUserRepository(options.users ?? [leaving, colleague]);
    userRepository.countAssignedWork.mockResolvedValue({
      clients: options.companies ?? 0,
      upcomingAppointments: 0,
      openContracts: 0,
      companies: [],
    });
    const roles = makeRoleCatalogue(undefined, options.roleManagers);
    const harness = makeUserAdminHarness();
    const permissionsChanged = { userChanged: jest.fn(), tenantChanged: jest.fn() };
    const useCase = new DeactivateUserUseCase(
      userRepository,
      new RoleManagementGuard(roles),
      harness.writeTx,
      permissionsChanged
    );
    const execute = (over: Record<string, unknown> = {}) =>
      useCase.execute({
        access: administrator({ userId: 'admin', tenantId: 'tenant1' }),
        requestingUserId: 'admin',
        tenantId: 'tenant1',
        userIdToDeactivate: 'leaving',
        ...over,
      });
    return { harness, permissionsChanged, execute };
  };

  it('FR-RBAC-05 refuses a caller without users.manage', async () => {
    const { harness, execute } = setup();
    await expect(execute({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(harness.staff.setActive).not.toHaveBeenCalled();
  });

  it('reports a user of another tenant as not found', async () => {
    const { execute } = setup({ users: [makeUser({ id: 'leaving', tenantId: 'other' })] });
    await expect(execute()).rejects.toThrow('User not found.');
  });

  it('refuses to let the caller deactivate themselves', async () => {
    const { execute } = setup();
    await expect(execute({ userIdToDeactivate: 'admin' })).rejects.toThrow('You cannot deactivate your own account.');
  });

  it('is idempotent for an already-deactivated user', async () => {
    const { harness, execute } = setup({ users: [makeUser({ id: 'leaving', isActive: false })] });
    await expect(execute()).resolves.toEqual({ userId: 'leaving', reassigned: { companies: 0, contracts: 0 } });
    expect(harness.staff.setActive).not.toHaveBeenCalled();
  });

  describe('forced reassignment (FR-USR-05)', () => {
    it('FR-USR-05 refuses to deactivate a user who still has companies, without a colleague to take them', async () => {
      const { harness, execute } = setup({ companies: 3 });

      await expect(execute()).rejects.toThrow(ReassignmentRequiredError);
      expect(harness.staff.setActive).not.toHaveBeenCalled();
      expect(harness.assignments.reassignCompanies).not.toHaveBeenCalled();
    });

    it('deactivates a user with no companies without asking for a colleague', async () => {
      const { harness, execute } = setup();

      await execute();

      expect(harness.staff.setActive).toHaveBeenCalledWith('tenant1', 'leaving', false);
    });

    it('FR-USR-05 hands the companies and open contracts to the colleague, then deactivates', async () => {
      const { harness, execute } = setup({ companies: 2 });
      harness.assignments.reassignCompanies.mockResolvedValue([
        { id: 'c1', label: 'Alfa' },
        { id: 'c2', label: 'Beta' },
      ]);
      harness.assignments.reassignOpenContracts.mockResolvedValue([{ id: 'k1', label: 'Alfa — Gold' }]);

      const result = await execute({ reassignToUserId: 'colleague' });

      expect(harness.assignments.reassignCompanies).toHaveBeenCalledWith('tenant1', 'leaving', 'colleague');
      expect(harness.assignments.reassignOpenContracts).toHaveBeenCalledWith('tenant1', 'leaving', 'colleague');
      expect(harness.staff.setActive).toHaveBeenCalledWith('tenant1', 'leaving', false);
      expect(result.reassigned).toEqual({ companies: 2, contracts: 1 });
    });

    it('FR-USR-06 FR-AUD-02 audits every reassignment and the deactivation itself', async () => {
      const { harness, execute } = setup({ companies: 1 });
      harness.assignments.reassignCompanies.mockResolvedValue([{ id: 'c1', label: 'Alfa' }]);
      harness.assignments.reassignOpenContracts.mockResolvedValue([{ id: 'k1', label: 'Alfa — Gold' }]);

      await execute({ reassignToUserId: 'colleague' });

      const actor = { tenantId: 'tenant1', userId: 'admin', userRole: 'ADMINISTRATOR' };
      const assignee = [{ field: 'assignedUserId', old: 'leaving', new: 'colleague' }];
      expect(harness.recordedAuditEntries()).toEqual([
        { ...actor, action: AuditAction.Update, entityType: 'Client', entityId: 'c1', entityLabel: 'Alfa', changes: assignee },
        { ...actor, action: AuditAction.Update, entityType: 'Contract', entityId: 'k1', entityLabel: 'Alfa — Gold', changes: assignee },
        {
          ...actor,
          action: AuditAction.StatusChange,
          entityType: 'User',
          entityId: 'leaving',
          entityLabel: 'Ana Hoxha',
          changes: [{ field: 'isActive', old: true, new: false }],
        },
      ]);
    });

    it.each([
      ['the user being deactivated', 'leaving'],
      ['someone who does not exist', 'ghost'],
    ])('refuses to hand the companies to %s', async (_label, target) => {
      const { harness, execute } = setup({ companies: 1 });
      await expect(execute({ reassignToUserId: target })).rejects.toThrow(InvalidReassignmentTargetError);
      expect(harness.staff.setActive).not.toHaveBeenCalled();
    });

    it('refuses an inactive colleague or one from another workspace', async () => {
      const inactive = makeUser({ id: 'inactive', isActive: false });
      const foreign = makeUser({ id: 'foreign', tenantId: 'other' });
      const { execute } = setup({ users: [leaving, inactive, foreign], companies: 1 });

      await expect(execute({ reassignToUserId: 'inactive' })).rejects.toThrow(InvalidReassignmentTargetError);
      await expect(execute({ reassignToUserId: 'foreign' })).rejects.toThrow(InvalidReassignmentTargetError);
    });
  });

  describe('lock-out guard (FR-RBAC-08)', () => {
    it('FR-RBAC-08 refuses to deactivate the last active user who can manage roles', async () => {
      const lastAdmin = makeUser({ id: 'leaving', role: UserRole.BUSINESS_OWNER, roleId: 'role-ADMINISTRATOR' });
      const { harness, execute } = setup({ users: [lastAdmin], roleManagers: ['leaving'] });

      await expect(execute()).rejects.toThrow(LastRoleManagerError);
      expect(harness.staff.setActive).not.toHaveBeenCalled();
    });

    it('deactivates an Administrator while another one remains', async () => {
      const admin = makeUser({ id: 'leaving', role: UserRole.BUSINESS_OWNER, roleId: 'role-ADMINISTRATOR' });
      const { harness, execute } = setup({ users: [admin], roleManagers: ['leaving', 'admin'] });

      await execute();

      expect(harness.staff.setActive).toHaveBeenCalledWith('tenant1', 'leaving', false);
    });
  });

  it('FR-USR-04 clears the access cache so the user\'s still-valid token stops working', async () => {
    const { permissionsChanged, execute } = setup();
    await execute();
    expect(permissionsChanged.userChanged).toHaveBeenCalledWith('leaving');
  });

  it('FR-AUD-04 leaves the user active in the cache\'s eyes when the audit write fails', async () => {
    const { harness, permissionsChanged, execute } = setup();
    harness.auditTrail.record.mockRejectedValue(new Error('audit write failed'));

    await expect(execute()).rejects.toThrow('audit write failed');
    expect(permissionsChanged.userChanged).not.toHaveBeenCalled();
  });
});
