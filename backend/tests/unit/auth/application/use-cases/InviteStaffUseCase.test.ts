import { InviteStaffUseCase } from '@auth/application/use-cases/InviteStaffUseCase';
import { IEmailSender } from '@auth/application/ports/IEmailSender';
import { UserRole } from '@auth/domain/enums/UserRole';
import { UnknownRoleError } from '@auth/domain/errors';
import { administrator, salesUser } from '../../../../support/access';
import { makeRoleCatalogue } from '../../../../support/fakeUserAdmin';
import { makeUserAdminHarness } from '../../../../support/fakeUserAdminTransaction';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';

describe('InviteStaffUseCase', () => {
  const setup = () => {
    const harness = makeUserAdminHarness();
    const emailSender: jest.Mocked<IEmailSender> = {
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
      sendWorkspaceCreatedEmail: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new InviteStaffUseCase(makeRoleCatalogue(), harness.writeTx, emailSender);
    const execute = (over: Record<string, unknown> = {}) =>
      useCase.execute({
        access: administrator({ userId: 'admin', tenantId: 'tenant1' }),
        invitingUserId: 'admin',
        tenantId: 'tenant1',
        tenantName: 'Wellness Albania',
        inviteeEmail: 'new@example.com',
        roleId: 'role-RECEPTION',
        warehouseId: null,
        ...over,
      });
    return { harness, emailSender, execute };
  };

  it('FR-USR-02 invites a person with one of the workspace\'s roles', async () => {
    const { harness, emailSender, execute } = setup();

    const result = await execute();

    const invitation = harness.invitations.create.mock.calls[0][0];
    expect(invitation).toMatchObject({
      tenantId: 'tenant1',
      email: 'new@example.com',
      roleId: 'role-RECEPTION',
      role: UserRole.STAFF,
      invitedByUserId: 'admin',
    });
    expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith('new@example.com', invitation.token, 'Wellness Albania');
    expect(result).toEqual({ email: 'new@example.com', token: invitation.token });
  });

  it('writes BUSINESS_OWNER as the legacy role of an Administrator invitation', async () => {
    const { harness, execute } = setup();
    await execute({ roleId: 'role-ADMINISTRATOR' });
    expect(harness.invitations.create.mock.calls[0][0].role).toBe(UserRole.BUSINESS_OWNER);
  });

  it('FR-USR-06 audits the invitation with its email and role', async () => {
    const { harness, execute } = setup();

    await execute();

    const [entry] = harness.recordedAuditEntries();
    expect(entry).toMatchObject({
      tenantId: 'tenant1',
      userId: 'admin',
      userRole: 'ADMINISTRATOR',
      action: AuditAction.Create,
      entityType: 'Invitation',
      entityLabel: 'new@example.com',
    });
    expect(entry.changes).toEqual([
      { field: 'email', old: null, new: 'new@example.com' },
      { field: 'role', old: null, new: 'RECEPTION' },
    ]);
  });

  it('refuses a role that is not one of this workspace\'s, and sends nothing', async () => {
    const { harness, emailSender, execute } = setup();

    await expect(execute({ roleId: 'role-elsewhere' })).rejects.toThrow(UnknownRoleError);
    expect(harness.invitations.create).not.toHaveBeenCalled();
    expect(emailSender.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses an inviter without users.manage', async () => {
    const { harness, execute } = setup();
    await expect(execute({ access: salesUser() })).rejects.toThrow(PermissionDeniedError);
    expect(harness.invitations.create).not.toHaveBeenCalled();
  });

  it('FR-AUD-04 sends no email when the audited write fails', async () => {
    const { harness, emailSender, execute } = setup();
    harness.auditTrail.record.mockRejectedValue(new Error('audit write failed'));

    await expect(execute()).rejects.toThrow('audit write failed');
    expect(emailSender.sendInvitationEmail).not.toHaveBeenCalled();
  });
});
