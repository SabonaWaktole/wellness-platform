import { InviteStaffUseCase } from '@auth/application/use-cases/InviteStaffUseCase';
import { IInvitationRepository } from '@auth/domain/repositories/IInvitationRepository';
import { IEmailSender } from '@auth/application/ports/IEmailSender';
import { UserRole } from '@auth/domain/enums/UserRole';
import { administrator, salesUser } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

describe('InviteStaffUseCase', () => {
  let useCase: InviteStaffUseCase;
  let invitationRepository: jest.Mocked<IInvitationRepository>;
  let emailSender: jest.Mocked<IEmailSender>;

  beforeEach(() => {
    invitationRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      findByTenantId: jest.fn(),
      markAccepted: jest.fn(),
      delete: jest.fn(),
    };
    emailSender = {
      // Both return Promise<void> per IEmailSender; the use case fires them
      // without awaiting and attaches .catch(), so the doubles must resolve.
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
      sendWorkspaceCreatedEmail: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new InviteStaffUseCase(invitationRepository, emailSender);
  });

  it('should successfully invite a staff member', async () => {
    invitationRepository.create.mockImplementation(async (invitation) => invitation);

    const result = await useCase.execute({
      invitingUserId: 'owner-1',
      access: administrator(),
      tenantId: 'tenant-1',
      inviteeEmail: 'staff@example.com',
      role: UserRole.STAFF,
      tenantName: 'Acme Corp',
    });

    expect(invitationRepository.create).toHaveBeenCalled();
    expect(emailSender.sendInvitationEmail).toHaveBeenCalledWith('staff@example.com', expect.any(String), 'Acme Corp');
    expect(result.email).toBe('staff@example.com');
    expect(result.token).toBeDefined();
  });

  it('FR-RBAC-05 refuses an inviter without users.manage', async () => {
    await expect(
      useCase.execute({
        invitingUserId: 'staff-1',
        access: salesUser(),
        tenantId: 'tenant-1',
        inviteeEmail: 'staff2@example.com',
        role: UserRole.STAFF,
        tenantName: 'Acme Corp',
      })
    ).rejects.toThrow(PermissionDeniedError);
  });
});
