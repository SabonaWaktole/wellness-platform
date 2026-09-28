import { RequestPasswordResetUseCase } from '@auth/application/use-cases/RequestPasswordResetUseCase';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { IPasswordResetTokenRepository } from '@auth/domain/repositories/IPasswordResetTokenRepository';
import { IEmailSender } from '@auth/application/ports/IEmailSender';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';

describe('RequestPasswordResetUseCase', () => {
  let useCase: RequestPasswordResetUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let prtRepository: jest.Mocked<IPasswordResetTokenRepository>;
  let emailSender: jest.Mocked<IEmailSender>;
  let tenantRepository: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    userRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findByTenantId: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    prtRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      markUsed: jest.fn(),
    };
    emailSender = {
      // Both return Promise<void> per IEmailSender; the use case fires them
      // without awaiting and attaches .catch(), so the doubles must resolve.
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendTransactionalEmail: jest.fn().mockResolvedValue(undefined),
      sendWorkspaceCreatedEmail: jest.fn().mockResolvedValue(undefined),
    };

    tenantRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'tenant-1', defaultLanguage: 'sq' }),
    } as unknown as jest.Mocked<ITenantRepository>;

    useCase = new RequestPasswordResetUseCase(userRepository, prtRepository, emailSender, tenantRepository);
  });

  it('should generate a token and send an email if user exists', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', email: 'test@example.com', tenantId: 'tenant-1', language: null } as any);
    prtRepository.create.mockImplementation(async (token) => token);

    await useCase.execute({ email: 'test@example.com', tenantId: 'tenant-1' });

    expect(prtRepository.create).toHaveBeenCalled();
    expect(emailSender.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com', expect.any(String), 'sq');
  });

  it('FR-USR-01 writes the reset email in the language the user chose', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', email: 'test@example.com', tenantId: 'tenant-1', language: 'en' } as any);

    await useCase.execute({ email: 'test@example.com', tenantId: 'tenant-1' });

    expect(emailSender.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com', expect.any(String), 'en');
    expect(tenantRepository.findById).not.toHaveBeenCalled();
  });

  it('writes a platform administrator\'s reset email in English, having no workspace to follow', async () => {
    userRepository.findAnyByEmail.mockResolvedValue({ id: 'sa-1', email: 'sa@example.com', tenantId: null, language: null } as any);

    await useCase.execute({ email: 'sa@example.com', tenantId: null });

    expect(emailSender.sendPasswordResetEmail).toHaveBeenCalledWith('sa@example.com', expect.any(String), 'en');
  });

  it('should fail silently (not throw) if user does not exist', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute({ email: 'test@example.com', tenantId: 'tenant-1' })).resolves.not.toThrow();

    expect(prtRepository.create).not.toHaveBeenCalled();
    expect(emailSender.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
