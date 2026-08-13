import { ReactivateUserUseCase } from '@auth/application/use-cases/ReactivateUserUseCase';
import { IUserRepository } from '@auth/domain/repositories/IUserRepository';
import { User } from '@auth/domain/entities/User';
import { UserRole } from '@auth/domain/enums/UserRole';

/**
 * Reactivation existed as a repository capability (`setActive(id, boolean)`)
 * but had no caller passing `true` and no route â€” deactivation was one-way.
 * TD-030.
 */
describe('ReactivateUserUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let useCase: ReactivateUserUseCase;

  const makeUser = (overrides: Partial<Parameters<typeof User.create>[0]> = {}) =>
    User.create({
      id: 'u1',
      email: 'staff@tenant1.test',
      hashedPassword: 'hash',
      role: UserRole.STAFF,
      tenantId: 'tenant1',
      isActive: false,
      ...overrides,
    } as any);

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
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

    useCase = new ReactivateUserUseCase(userRepository);
  });

  it('reactivates a deactivated staff member', async () => {
    userRepository.findById.mockResolvedValue(makeUser());

    const result = await useCase.execute({
      requestingUserRole: UserRole.BUSINESS_OWNER,
      tenantId: 'tenant1',
      userIdToReactivate: 'u1',
    });

    expect(result).toEqual({ userId: 'u1' });
    expect(userRepository.setActive).toHaveBeenCalledWith('u1', true);
  });

  it('is idempotent â€” reactivating an active member succeeds and writes nothing', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ isActive: true } as any));

    const result = await useCase.execute({
      requestingUserRole: UserRole.BUSINESS_OWNER,
      tenantId: 'tenant1',
      userIdToReactivate: 'u1',
    });

    expect(result).toEqual({ userId: 'u1' });
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('rejects a STAFF caller', async () => {
    await expect(
      useCase.execute({
        requestingUserRole: UserRole.STAFF,
        tenantId: 'tenant1',
        userIdToReactivate: 'u1',
      })
    ).rejects.toThrow('Only Business Owners can reactivate');

    expect(userRepository.setActive).not.toHaveBeenCalled();
    // Authorisation is checked before the record is even read.
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('refuses to reactivate a user belonging to another tenant', async () => {
    // The isolation case that matters most here: reactivation would otherwise
    // be a way to restore access that deactivation was used to remove.
    userRepository.findById.mockResolvedValue(makeUser({ tenantId: 'tenant2' } as any));

    await expect(
      useCase.execute({
        requestingUserRole: UserRole.BUSINESS_OWNER,
        tenantId: 'tenant1',
        userIdToReactivate: 'u1',
      })
    ).rejects.toThrow('User not found.');

    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('reports a missing user rather than silently succeeding', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        requestingUserRole: UserRole.BUSINESS_OWNER,
        tenantId: 'tenant1',
        userIdToReactivate: 'nobody',
      })
    ).rejects.toThrow('User not found.');

    expect(userRepository.setActive).not.toHaveBeenCalled();
  });
});
