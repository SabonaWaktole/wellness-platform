import { UpdateUserProfileUseCase } from './UpdateUserProfileUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { UnauthorizedError } from '../../domain/errors';
import { v4 as uuidv4 } from 'uuid';
import { administrator, platformOperator, salesUser } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('UpdateUserProfileUseCase', () => {
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let useCase: UpdateUserProfileUseCase;
  let testUser: User;

  beforeEach(() => {
    testUser = User.create({
      id: uuidv4(),
      email: 'test@example.com',
      hashedPassword: 'hashedpassword',
      role: UserRole.STAFF,
      tenantId: uuidv4(),
      createdAt: new Date(),
    });

    mockUserRepository = {
      findById: jest.fn().mockResolvedValue(testUser),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn().mockResolvedValue(undefined),
      findByTenantId: jest.fn(),
    } as any;

    useCase = new UpdateUserProfileUseCase(mockUserRepository);
  });

  it('should successfully update first name and last name', async () => {
    await useCase.execute({
      userId: testUser.id,
      requestingUserId: testUser.id,
      access: administrator(),
      firstName: 'John',
      lastName: 'Doe',
    });

    expect(mockUserRepository.updateProfile).toHaveBeenCalledWith(testUser.id, {
      firstName: 'John',
      lastName: 'Doe',
    });
  });

  it('should throw error if user tries to update someone else profile', async () => {
    await expect(useCase.execute({
      userId: testUser.id,
      requestingUserId: 'different-id',
      access: administrator(),
      firstName: 'John',
    })).rejects.toThrow(UnauthorizedError);
  });

  it('should throw error if STAFF tries to update email', async () => {
    await expect(useCase.execute({
      userId: testUser.id,
      requestingUserId: testUser.id,
      access: salesUser(),
      email: 'new@example.com',
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should allow BUSINESS_OWNER to update email', async () => {
    const ownerUser = User.create({
      ...testUser,
      role: UserRole.BUSINESS_OWNER,
    });
    mockUserRepository.findById.mockResolvedValue(ownerUser);
    mockUserRepository.findAnyByEmail.mockResolvedValue(null);

    await useCase.execute({
      userId: ownerUser.id,
      requestingUserId: ownerUser.id,
      access: administrator(),
      email: 'new@example.com',
    });

    expect(mockUserRepository.updateProfile).toHaveBeenCalledWith(ownerUser.id, {
      email: 'new@example.com',
    });
  });

  it('should allow SUPER_ADMIN to update its own email', async () => {
    const adminUser = User.create({
      ...testUser,
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
    });
    mockUserRepository.findById.mockResolvedValue(adminUser);
    mockUserRepository.findAnyByEmail.mockResolvedValue(null);

    await useCase.execute({
      userId: adminUser.id,
      requestingUserId: adminUser.id,
      access: platformOperator(),
      email: 'new-admin@example.com',
    });

    expect(mockUserRepository.updateProfile).toHaveBeenCalledWith(adminUser.id, {
      email: 'new-admin@example.com',
    });
  });

  it('should throw error if BUSINESS_OWNER tries to update to an existing email', async () => {
    const ownerUser = User.create({
      ...testUser,
      role: UserRole.BUSINESS_OWNER,
    });
    mockUserRepository.findById.mockResolvedValue(ownerUser);
    mockUserRepository.findAnyByEmail.mockResolvedValue({} as User); // existing user

    await expect(useCase.execute({
      userId: ownerUser.id,
      requestingUserId: ownerUser.id,
      access: administrator(),
      email: 'existing@example.com',
    })).rejects.toThrow('Email is already in use');
  });
});
