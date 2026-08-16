import { AcceptInvitationUseCase } from '@auth/application/use-cases/AcceptInvitationUseCase';
import { IInvitationRepository } from '@auth/domain/repositories/IInvitationRepository';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { UserRole } from '@auth/domain/enums/UserRole';
import { InvitationExpiredError, InvitationAlreadyAcceptedError } from '@auth/domain/errors';
import { Invitation } from '@auth/domain/entities/Invitation';

describe('AcceptInvitationUseCase', () => {
  let useCase: AcceptInvitationUseCase;
  let invitationRepository: jest.Mocked<IInvitationRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;

  let tenantRepository: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    invitationRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      findByTenantId: jest.fn(),
      markAccepted: jest.fn(),
      delete: jest.fn(),
    };
    userRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findByTenantId: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    passwordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    };

    tenantRepository = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'tenant-1', urlSlug: 'test-tenant' }),
      findBySlug: jest.fn(),
      findAll: jest.fn(),
      updateSettings: jest.fn(),
      updateSettingsForMany: jest.fn(),
      setSubscriptionStatus: jest.fn(),
    };

    useCase = new AcceptInvitationUseCase(invitationRepository, userRepository, passwordHasher, tenantRepository);
  });

  it('should accept an invitation and create a user', async () => {
    const invitation = Invitation.create({
      id: 'inv-1',
      tenantId: 'tenant-1',
      email: 'staff@example.com',
      role: UserRole.STAFF,
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 86400000), // future
      acceptedAt: null,
    });

    invitationRepository.findByToken.mockResolvedValue(invitation);
    passwordHasher.hash.mockResolvedValue('hashed-pass');
    userRepository.create.mockImplementation(async (user) => user);

    const result = await useCase.execute({
      token: 'valid-token',
      newPassword: 'StrongPassword123!',
    });

    expect(result.user.email).toBe('staff@example.com');
    expect(result.user.role).toBe(UserRole.STAFF);
    expect(result.user.tenantId).toBe('tenant-1');
    expect(result.tenantSlug).toBe('test-tenant');
    expect(userRepository.create).toHaveBeenCalled();
    expect(invitationRepository.markAccepted).toHaveBeenCalledWith('inv-1', expect.any(Date));
  });

  it('should accept a Platform Admin invitation without a tenant', async () => {
    const invitation = Invitation.create({
      id: 'inv-2',
      tenantId: null,
      email: 'newadmin@example.com',
      role: UserRole.SUPER_ADMIN,
      token: 'admin-token',
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    });

    invitationRepository.findByToken.mockResolvedValue(invitation);
    passwordHasher.hash.mockResolvedValue('hashed-pass');
    userRepository.create.mockImplementation(async (user) => user);

    const result = await useCase.execute({
      token: 'admin-token',
      newPassword: 'StrongPassword123!',
    });

    expect(result.user.role).toBe(UserRole.SUPER_ADMIN);
    expect(result.user.tenantId).toBeNull();
    expect(result.tenantSlug).toBeUndefined();
    expect(tenantRepository.findById).not.toHaveBeenCalled();
  });

  it('should throw InvitationExpiredError if token is expired', async () => {
    const invitation = Invitation.create({
      id: 'inv-1',
      tenantId: 'tenant-1',
      email: 'staff@example.com',
      role: UserRole.STAFF,
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000), // past
      acceptedAt: null,
    });
    invitationRepository.findByToken.mockResolvedValue(invitation);

    await expect(useCase.execute({ token: 'expired-token', newPassword: 'StrongPassword123!' }))
      .rejects.toThrow(InvitationExpiredError);
  });
  
  it('should throw InvitationAlreadyAcceptedError if already accepted', async () => {
    const invitation = Invitation.create({
      id: 'inv-1',
      tenantId: 'tenant-1',
      email: 'staff@example.com',
      role: UserRole.STAFF,
      token: 'used-token',
      expiresAt: new Date(Date.now() + 86400000), 
      acceptedAt: new Date(), // accepted
    });
    invitationRepository.findByToken.mockResolvedValue(invitation);

    await expect(useCase.execute({ token: 'used-token', newPassword: 'StrongPassword123!' }))
      .rejects.toThrow(InvitationAlreadyAcceptedError);
  });
});
