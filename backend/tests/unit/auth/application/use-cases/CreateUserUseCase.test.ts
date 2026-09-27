import { CreateUserUseCase } from '@auth/application/use-cases/CreateUserUseCase';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { IPasswordHasher } from '@auth/application/ports/IPasswordHasher';
import { UserRole } from '@auth/domain/enums/UserRole';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { UnauthorizedError } from '@auth/domain/errors';
import { administrator, platformOperator, salesUser } from '../../../../support/access';

describe('CreateUserUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let useCase: CreateUserUseCase;

  const validInput = {
    tenantId: 'tenant-a',
    email: 'new@example.com',
    password: 'Password1',
    role: UserRole.STAFF,
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findAnyByEmail: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn().mockImplementation(async (u) => u),
      updatePassword: jest.fn(),
      findByTenantId: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
      updateProfile: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed'),
      compare: jest.fn(),
    };

    useCase = new CreateUserUseCase(userRepository, passwordHasher);
  });

  describe('who may create what', () => {
    it('lets a SUPER_ADMIN create a BUSINESS_OWNER in a workspace they do not belong to', async () => {
      const result = await useCase.execute({
        ...validInput,
        access: platformOperator(),
        callerTenantId: null,
        role: UserRole.BUSINESS_OWNER,
      });

      expect(result.role).toBe(UserRole.BUSINESS_OWNER);
      expect(result.tenantId).toBe('tenant-a');
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('lets a BUSINESS_OWNER create STAFF in their own workspace', async () => {
      const result = await useCase.execute({
        ...validInput,
        access: administrator(),
        callerTenantId: 'tenant-a',
      });

      expect(result.role).toBe(UserRole.STAFF);
    });

    it('stops a BUSINESS_OWNER creating another BUSINESS_OWNER', async () => {
      await expect(
        useCase.execute({
          ...validInput,
          access: administrator(),
          callerTenantId: 'tenant-a',
          role: UserRole.BUSINESS_OWNER,
        })
      ).rejects.toThrow(UnauthorizedError);
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('stops a BUSINESS_OWNER creating a user in another workspace', async () => {
      await expect(
        useCase.execute({
          ...validInput,
          access: administrator(),
          callerTenantId: 'tenant-b',
        })
      ).rejects.toThrow(UnauthorizedError);
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('FR-RBAC-05 stops a role without users.manage creating anyone', async () => {
      await expect(
        useCase.execute({
          ...validInput,
          access: salesUser(),
          callerTenantId: 'tenant-a',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });

    // The platform role is seeded, never minted through an endpoint: it grants
    // access to every workspace, so a route that could create one would turn a
    // single compromised session into full platform access.
    it('refuses to create a SUPER_ADMIN even for a SUPER_ADMIN caller', async () => {
      await expect(
        useCase.execute({
          ...validInput,
          access: platformOperator(),
          callerTenantId: null,
          role: UserRole.SUPER_ADMIN,
        })
      ).rejects.toThrow(UnauthorizedError);
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('credentials', () => {
    it('stores a hash, never the plaintext, and never returns either', async () => {
      const result = await useCase.execute({
        ...validInput,
        access: administrator(),
        callerTenantId: 'tenant-a',
      });

      expect(passwordHasher.hash).toHaveBeenCalledWith('Password1');
      expect(userRepository.create.mock.calls[0][0].hashedPassword).toBe('hashed');
      expect(JSON.stringify(result)).not.toContain('Password1');
      expect(JSON.stringify(result)).not.toContain('hashed');
    });

    it('creates the account already active, so the password works immediately', async () => {
      const result = await useCase.execute({
        ...validInput,
        access: administrator(),
        callerTenantId: 'tenant-a',
      });

      expect(result.isActive).toBe(true);
    });
  });

  it('rejects an email already used in the SAME workspace', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'existing' } as any);

    await expect(
      useCase.execute({
        ...validInput,
        access: administrator(),
        callerTenantId: 'tenant-a',
      })
    ).rejects.toThrow(/already exists/i);
  });

  // Uniqueness is per workspace, matching how LoginUseCase looks an account up.
  // Two businesses may each employ the same person.
  it('allows the same email in a DIFFERENT workspace', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({
        ...validInput,
        tenantId: 'tenant-b',
        access: platformOperator(),
        callerTenantId: null,
      })
    ).resolves.toMatchObject({ tenantId: 'tenant-b' });

    expect(userRepository.findByEmail).toHaveBeenCalledWith('new@example.com', 'tenant-b');
  });
});
