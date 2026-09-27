import { DeactivateUserUseCase } from './DeactivateUserUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { UnauthorizedError } from '../../domain/errors';

describe('DeactivateUserUseCase', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let useCase: DeactivateUserUseCase;

  const TENANT = 'tenant-1';
  const OTHER_TENANT = 'tenant-2';
  const OWNER_ID = 'owner-1';

  const makeUser = (over: Partial<{ id: string; role: UserRole; tenantId: string; isActive: boolean }> = {}) =>
    User.create({
      id: over.id ?? 'staff-1',
      email: 'staff@example.com',
      hashedPassword: 'h',
      role: over.role ?? UserRole.STAFF,
      tenantId: over.tenantId ?? TENANT,
      isActive: over.isActive ?? true,
      createdAt: new Date(),
    });

  const deactivate = (over: any = {}) =>
    useCase.execute({
      requestingUserRole: UserRole.BUSINESS_OWNER,
      requestingUserId: OWNER_ID,
      tenantId: TENANT,
      userIdToDeactivate: 'staff-1',
      ...over,
    });

  beforeEach(() => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      findByEmail: jest.fn(),
      findAnyByEmail: jest.fn(),
      findSuperAdminByEmail: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn(),
      updateProfile: jest.fn(),
      findByTenantId: jest.fn(),
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    useCase = new DeactivateUserUseCase(userRepository);
  });

  it('deactivates a staff member', async () => {
    await deactivate();
    expect(userRepository.setActive).toHaveBeenCalledWith('staff-1', false);
  });

  it('D1: clears the access cache for the deactivated user', async () => {
    const permissionsChanged = { userChanged: jest.fn(), tenantChanged: jest.fn() };
    useCase = new DeactivateUserUseCase(userRepository, permissionsChanged);

    await deactivate();

    expect(permissionsChanged.userChanged).toHaveBeenCalledWith('staff-1');
  });

  it('never deletes â€” deactivation is the only off-boarding path', () => {
    // Seven non-nullable columns reference User; a delete method would be
    // blocked by RESTRICT or would destroy financial and audit history.
    expect((userRepository as any).delete).toBeUndefined();
  });

  describe('role gating', () => {
    it('rejects STAFF', async () => {
      await expect(deactivate({ requestingUserRole: UserRole.STAFF })).rejects.toThrow(UnauthorizedError);
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('rejects SUPER_ADMIN, which has no business inside a tenant', async () => {
      await expect(deactivate({ requestingUserRole: UserRole.SUPER_ADMIN })).rejects.toThrow(UnauthorizedError);
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('refuses to deactivate a user belonging to another tenant', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ tenantId: OTHER_TENANT }));

      await expect(deactivate()).rejects.toThrow('User not found.');
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('reports a cross-tenant target as not found, leaking no existence', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ tenantId: OTHER_TENANT }));

      // Same message as a genuinely missing user.
      await expect(deactivate()).rejects.toThrow('User not found.');
    });
  });

  describe('guards', () => {
    it('refuses to let an owner deactivate themselves', async () => {
      await expect(deactivate({ userIdToDeactivate: OWNER_ID })).rejects.toThrow('your own account');
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('refuses to deactivate a BUSINESS_OWNER', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ id: 'owner-2', role: UserRole.BUSINESS_OWNER }));

      await expect(deactivate({ userIdToDeactivate: 'owner-2' })).rejects.toThrow('cannot be deactivated');
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(deactivate()).rejects.toThrow('User not found.');
    });

    it('is idempotent for an already-deactivated user', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(deactivate()).resolves.toEqual({ userId: 'staff-1' });
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });
  });

  it('leaves existing assignments untouched', async () => {
    // Deliberate: Appointment.assignedUserId is non-nullable, so forcing
    // reassignment would rewrite who held the work and falsify history. The
    // caller sees the counts and reassigns separately.
    await deactivate();

    expect(userRepository.setActive).toHaveBeenCalledTimes(1);
    expect(userRepository.updateRoleAndWarehouse).not.toHaveBeenCalled();
  });
});
