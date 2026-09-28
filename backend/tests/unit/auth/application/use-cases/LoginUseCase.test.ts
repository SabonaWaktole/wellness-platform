import { LoginUseCase } from '@auth/application/use-cases/LoginUseCase';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { ITenantRepository } from '@tenant/domain/repositories/ITenantRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { ITokenService } from '@auth/application/ports/ITokenService';
import { InvalidCredentialsError } from '@auth/domain/errors';
import { UserRole } from '@auth/domain/enums/UserRole';
import { TenantSuspendedError } from '@tenant/domain/errors';
import { Tenant } from '@tenant/domain/entities/Tenant';
import { SubscriptionStatus } from '@tenant/domain/enums/SubscriptionStatus';

/**
 * A real Tenant entity rather than an object literal cast to one â€” the use case
 * now asks it `isSuspended()`, which a literal cannot answer.
 */
const tenantEntity = (
  overrides: { id?: string; urlSlug?: string; subscriptionStatus?: SubscriptionStatus } = {}
) =>
  Tenant.create({
    id: overrides.id ?? 'tenant-1',
    name: 'Acme',
    urlSlug: overrides.urlSlug ?? 'acme',
    subscriptionStatus: overrides.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
    createdAt: new Date(),
  });

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let tenantRepository: jest.Mocked<ITenantRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let tokenService: jest.Mocked<ITokenService>;

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
    tenantRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findAll: jest.fn(),
    } as any;
    passwordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    };
    tokenService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    useCase = new LoginUseCase(
      userRepository,
      tenantRepository,
      passwordHasher,
      tokenService
    );
  });

  it('should login a tenant user successfully', async () => {
    tenantRepository.findBySlug.mockResolvedValue(tenantEntity());
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1', hashedPassword: 'hashed', isActive: true } as any);
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockReturnValue('valid-jwt-token');

    const result = await useCase.execute({
      email: 'staff@acme.com',
      password: 'Password123',
      tenantSlug: 'acme',
    });

    expect(result.token).toBe('valid-jwt-token');
    expect(tokenService.sign).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1' }));
  });

  it('should login a super admin successfully', async () => {
    userRepository.findAnyByEmail.mockResolvedValue({ id: 'sa-1', role: UserRole.SUPER_ADMIN, tenantId: null, hashedPassword: 'hashed', isActive: true } as any);
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockReturnValue('sa-jwt-token');

    const result = await useCase.execute({
      email: 'admin@platform.com',
      password: 'Password123',
      tenantSlug: null,
    });

    expect(result.token).toBe('sa-jwt-token');
    expect(result.tenantSlug).toBe(null);
    expect(tokenService.sign).toHaveBeenCalledWith(expect.objectContaining({ userId: 'sa-1', role: UserRole.SUPER_ADMIN, tenantId: null, tenantSlug: null }));
  });

  it('should login a regular user globally and fetch tenantSlug', async () => {
    userRepository.findAnyByEmail.mockResolvedValue({ id: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1', hashedPassword: 'hashed', isActive: true } as any);
    tenantRepository.findById.mockResolvedValue(tenantEntity());
    passwordHasher.compare.mockResolvedValue(true);
    tokenService.sign.mockReturnValue('user-jwt-token');

    const result = await useCase.execute({
      email: 'staff@acme.com',
      password: 'Password123',
      tenantSlug: null,
    });

    expect(result.token).toBe('user-jwt-token');
    expect(result.tenantSlug).toBe('acme');
    expect(tokenService.sign).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1', tenantSlug: 'acme' }));
  });

  it('should throw InvalidCredentialsError on invalid password', async () => {
    tenantRepository.findBySlug.mockResolvedValue(tenantEntity());
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1', hashedPassword: 'hashed', isActive: true } as any);
    passwordHasher.compare.mockResolvedValue(false);

    await expect(useCase.execute({ email: 'staff@acme.com', password: 'wrong', tenantSlug: 'acme' }))
      .rejects.toThrow(InvalidCredentialsError);
  });

  it('should throw InvalidCredentialsError if tenant slug is provided but user is SUPER_ADMIN', async () => {
    tenantRepository.findBySlug.mockResolvedValue(tenantEntity());
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', role: UserRole.SUPER_ADMIN, tenantId: null, hashedPassword: 'hashed', isActive: true } as any);

    await expect(useCase.execute({ email: 'admin@platform.com', password: 'Pass', tenantSlug: 'acme' }))
      .rejects.toThrow(InvalidCredentialsError);
  });

  it('rejects a deactivated user with the same error as a wrong password', async () => {
    tenantRepository.findBySlug.mockResolvedValue(tenantEntity());
    userRepository.findByEmail.mockResolvedValue({ id: 'user-1', role: UserRole.STAFF, tenantId: 'tenant-1', hashedPassword: 'hashed', isActive: false } as any);
    passwordHasher.compare.mockResolvedValue(true);

    // Correct password, but the account is off-boarded: no new token is issued,
    // and the generic error avoids disclosing that the account exists.
    await expect(
      useCase.execute({ email: 'staff@acme.com', password: 'Password123', tenantSlug: 'acme' })
    ).rejects.toThrow(InvalidCredentialsError);

    expect(tokenService.sign).not.toHaveBeenCalled();
  });

  describe('suspended workspaces', () => {
    const suspendedTenant = () =>
      tenantEntity({ subscriptionStatus: SubscriptionStatus.SUSPENDED });

    const activeUser = {
      id: 'user-1',
      role: UserRole.STAFF,
      tenantId: 'tenant-1',
      hashedPassword: 'hashed',
      isActive: true,
    };

    it('refuses a correct password with a named reason, issuing no token', async () => {
      tenantRepository.findBySlug.mockResolvedValue(suspendedTenant());
      userRepository.findByEmail.mockResolvedValue(activeUser as any);
      passwordHasher.compare.mockResolvedValue(true);

      await expect(
        useCase.execute({ email: 'staff@acme.com', password: 'Password123', tenantSlug: 'acme' })
      ).rejects.toThrow(TenantSuspendedError);

      expect(tokenService.sign).not.toHaveBeenCalled();
    });

    it('gives the GENERIC error when the password is also wrong', async () => {
      /*
       * Ordering, pinned. Suspension is checked after the password so the login
       * endpoint cannot be used to enumerate which workspaces are suspended â€”
       * "this company was cut off" is inferable business information and a slug
       * is public.
       */
      tenantRepository.findBySlug.mockResolvedValue(suspendedTenant());
      userRepository.findByEmail.mockResolvedValue(activeUser as any);
      passwordHasher.compare.mockResolvedValue(false);

      await expect(
        useCase.execute({ email: 'staff@acme.com', password: 'wrong', tenantSlug: 'acme' })
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('applies on the global login path too, not just the slug path', async () => {
      userRepository.findAnyByEmail.mockResolvedValue(activeUser as any);
      tenantRepository.findById.mockResolvedValue(suspendedTenant());
      passwordHasher.compare.mockResolvedValue(true);

      await expect(
        useCase.execute({ email: 'staff@acme.com', password: 'Password123', tenantSlug: null })
      ).rejects.toThrow(TenantSuspendedError);
    });

    it('never blocks a SUPER_ADMIN, who has no tenant', async () => {
      // The only role that can lift a suspension. If suspending tenants could
      // lock them out, there would be no way back.
      userRepository.findAnyByEmail.mockResolvedValue({
        id: 'sa-1',
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        hashedPassword: 'hashed',
        isActive: true,
      } as any);
      passwordHasher.compare.mockResolvedValue(true);
      tokenService.sign.mockReturnValue('token');

      const result = await useCase.execute({
        email: 'admin@platform.com',
        password: 'Password123',
        tenantSlug: null,
      });

      expect(result.token).toBe('token');
    });
  });
});
