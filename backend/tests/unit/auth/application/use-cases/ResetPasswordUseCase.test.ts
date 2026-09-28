import { ResetPasswordUseCase } from '@auth/application/use-cases/ResetPasswordUseCase';
import { IPasswordResetTokenRepository } from '@auth/domain/repositories/IPasswordResetTokenRepository';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { PasswordResetToken } from '@auth/domain/entities/PasswordResetToken';
import { TokenExpiredError, TokenAlreadyUsedError } from '@auth/domain/errors';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let prtRepository: jest.Mocked<IPasswordResetTokenRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;

  beforeEach(() => {
    prtRepository = {
      create: jest.fn(),
      findByToken: jest.fn(),
      markUsed: jest.fn(),
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

    useCase = new ResetPasswordUseCase(prtRepository, userRepository, passwordHasher);
  });

  it('should reset password successfully', async () => {
    const token = PasswordResetToken.create({
      id: 'prt-1',
      userId: 'user-1',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600000), // future
      usedAt: null,
    });

    prtRepository.findByToken.mockResolvedValue(token);
    passwordHasher.hash.mockResolvedValue('hashed-pass');

    await useCase.execute({
      token: 'valid-token',
      newPassword: 'StrongPassword123!',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('StrongPassword123!');
    expect(userRepository.updatePassword).toHaveBeenCalledWith('user-1', 'hashed-pass');
    expect(prtRepository.markUsed).toHaveBeenCalledWith('prt-1', expect.any(Date));
  });

  it('should throw TokenExpiredError if token is expired', async () => {
    const token = PasswordResetToken.create({
      id: 'prt-1',
      userId: 'user-1',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000), // past
      usedAt: null,
    });
    prtRepository.findByToken.mockResolvedValue(token);

    await expect(useCase.execute({ token: 'expired-token', newPassword: 'StrongPassword123!' }))
      .rejects.toThrow(TokenExpiredError);
  });

  it('should throw TokenAlreadyUsedError if token is already used', async () => {
    const token = PasswordResetToken.create({
      id: 'prt-1',
      userId: 'user-1',
      token: 'used-token',
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: new Date(), // used
    });
    prtRepository.findByToken.mockResolvedValue(token);

    await expect(useCase.execute({ token: 'used-token', newPassword: 'StrongPassword123!' }))
      .rejects.toThrow(TokenAlreadyUsedError);
  });
});
