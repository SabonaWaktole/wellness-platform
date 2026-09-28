import { AcceptInvitationUseCase } from '@auth/application/use-cases/AcceptInvitationUseCase';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { UserRole } from '@auth/domain/enums/UserRole';
import { InvitationExpiredError, InvitationAlreadyAcceptedError } from '@auth/domain/errors';
import { Invitation } from '@auth/domain/entities/Invitation';
import { makeRoleCatalogue } from '../../../../support/fakeUserAdmin';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';

const invitation = (overrides: Partial<Parameters<typeof Invitation.create>[0]> = {}) =>
  Invitation.create({
    id: 'inv-1',
    tenantId: 'tenant1',
    email: 'staff@example.com',
    role: UserRole.STAFF,
    roleId: 'role-SALES_MANAGER',
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    ...overrides,
  });

describe('AcceptInvitationUseCase', () => {
  const setup = (found: Invitation) => {
    const harness = makeUserAdminHarness();
    harness.invitations.findByToken.mockResolvedValue(found);
    const passwordHasher: jest.Mocked<IPasswordHasher> = { hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() };
    const tenantRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'tenant1', urlSlug: 'wellness' }),
    } as unknown as jest.Mocked<ITenantRepository>;
    const useCase = new AcceptInvitationUseCase(
      harness.invitations,
      passwordHasher,
      tenantRepository,
      makeRoleCatalogue(),
      harness.writeTx
    );
    const accept = () => useCase.execute({ token: found.token, newPassword: 'StrongPassword123!' });
    return { harness, tenantRepository, accept };
  };

  it('FR-USR-02 creates the account with the role it was invited with', async () => {
    const { harness, accept } = setup(invitation());

    const result = await accept();

    const created = harness.staff.create.mock.calls[0][0];
    expect(created).toMatchObject({ email: 'staff@example.com', roleId: 'role-SALES_MANAGER', role: UserRole.STAFF, tenantId: 'tenant1' });
    expect(result.user).toBe(created);
    expect(result.tenantSlug).toBe('wellness');
    expect(harness.invitations.markAccepted).toHaveBeenCalledWith('inv-1', expect.any(Date));
  });

  it('FR-USR-06 audits the new account, as its own action', async () => {
    const { harness, accept } = setup(invitation());

    const { user } = await accept();

    expect(harness.recordedAuditEntries()).toEqual([
      {
        tenantId: 'tenant1',
        userId: user.id,
        userRole: 'SALES_MANAGER',
        action: AuditAction.Create,
        entityType: 'User',
        entityId: user.id,
        entityLabel: 'staff@example.com',
        changes: [
          { field: 'email', old: null, new: 'staff@example.com' },
          { field: 'role', old: null, new: 'SALES_MANAGER' },
        ],
      },
    ]);
  });

  it('falls back to D2 for an invitation sent before invitations carried a role', async () => {
    const { harness, accept } = setup(invitation({ roleId: null, role: UserRole.BUSINESS_OWNER }));

    await accept();

    expect(harness.staff.create.mock.calls[0][0].roleId).toBeNull();
    expect(harness.recordedAuditEntries()[0].userRole).toBe('ADMINISTRATOR');
  });

  it('accepts a Platform Admin invitation, which has no workspace and so no audit entry', async () => {
    const { harness, tenantRepository, accept } = setup(
      invitation({ tenantId: null, roleId: null, role: UserRole.SUPER_ADMIN })
    );

    const result = await accept();

    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(result.tenantSlug).toBeUndefined();
    expect(tenantRepository.findById).not.toHaveBeenCalled();
    expect(harness.auditTrail.record).not.toHaveBeenCalled();
  });

  it('throws InvitationExpiredError for an expired invitation', async () => {
    const { harness, accept } = setup(invitation({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(accept()).rejects.toThrow(InvitationExpiredError);
    expect(harness.staff.create).not.toHaveBeenCalled();
  });

  it('throws InvitationAlreadyAcceptedError for a used invitation', async () => {
    const { accept } = setup(invitation({ acceptedAt: new Date() }));
    await expect(accept()).rejects.toThrow(InvitationAlreadyAcceptedError);
  });
});
