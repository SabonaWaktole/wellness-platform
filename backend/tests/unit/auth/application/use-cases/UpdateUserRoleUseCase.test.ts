import { UpdateUserRoleUseCase } from '@auth/application/use-cases/UpdateUserRoleUseCase';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { User } from '@auth/domain/entities/User';
import { UserRole } from '@auth/domain/enums/UserRole';
import { UnauthorizedError } from '@auth/domain/errors';

describe('UpdateUserRoleUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let useCase: UpdateUserRoleUseCase;

  const makeUser = (overrides: Partial<Parameters<typeof User.create>[0]> = {}) =>
    User.create({
      id: 'u1',
      email: 'staff@tenant1.test',
      hashedPassword: 'hash',
      role: UserRole.STAFF,
      tenantId: 'tenant1',
      isActive: true,
      ...overrides,
    } as any);

  beforeEach(() => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findByTenantId: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<IUserRepository>;

    useCase = new UpdateUserRoleUseCase(userRepository);
  });

  const execute = (over: any = {}) =>
    useCase.execute({
      invitingUserRole: UserRole.BUSINESS_OWNER,
      tenantId: 'tenant1',
      userIdToUpdate: 'u1',
      newRole: UserRole.STAFF,
      newWarehouseId: null,
      ...over,
    });

  it('rejects a non-owner, non-super-admin caller', async () => {
    await expect(execute({ invitingUserRole: UserRole.STAFF })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.updateRoleAndWarehouse).not.toHaveBeenCalled();
  });

  it('rejects a user outside the caller tenant', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ tenantId: 'other-tenant' } as any));
    await expect(execute()).rejects.toThrow(UnauthorizedError);
  });

  it('updates the role and warehouse', async () => {
    await execute({ newRole: UserRole.BUSINESS_OWNER, newWarehouseId: 'wh-1' });
    expect(userRepository.updateRoleAndWarehouse).toHaveBeenCalledWith('u1', UserRole.BUSINESS_OWNER, 'wh-1');
  });

  it('FR-USR-03: clears the access cache for the updated user', async () => {
    const permissionsChanged = { userChanged: jest.fn(), tenantChanged: jest.fn() };
    useCase = new UpdateUserRoleUseCase(userRepository, permissionsChanged);

    await execute();

    expect(permissionsChanged.userChanged).toHaveBeenCalledWith('u1');
  });
});
