import { PlatformDeleteUserUseCase } from './PlatformDeleteUserUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IOwnershipTransactions } from '../ports/IOwnershipTransactions';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import {
  UnauthorizedError,
  UserNotFoundError,
  CannotModifySuperAdminError,
  OwnershipTransferRequiredError,
  InvalidOwnershipTargetError,
} from '../../domain/errors';
import { ConfirmationMismatchError } from '../../../shared/domain/errors/ConfirmationMismatchError';

describe('PlatformDeleteUserUseCase', () => {
  let useCase: PlatformDeleteUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let ownershipTransactions: jest.Mocked<IOwnershipTransactions>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const TENANT = 'tenant-1';
  const CALLER = 'super-admin-1';

  const makeUser = (over: Partial<{ id: string; role: UserRole; tenantId: string | null; email: string }> = {}) =>
    User.create({
      id: over.id ?? 'user-1',
      email: over.email ?? `${over.id ?? 'user-1'}@example.com`,
      hashedPassword: 'h',
      role: over.role ?? UserRole.STAFF,
      tenantId: over.tenantId === undefined ? TENANT : over.tenantId,
      isActive: true,
      createdAt: new Date(),
    });

  const del = (over: any = {}) =>
    useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      callerId: CALLER,
      userId: 'user-1',
      confirmEmail: 'user-1@example.com',
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
    ownershipTransactions = {
      promoteForSuspension: jest.fn(),
      restoreOwnership: jest.fn(),
      keepOwnership: jest.fn(),
      keepBothOwners: jest.fn(),
      promoteForDeletion: jest.fn(),
    };
    auditLogger = { record: jest.fn(), findRecent: jest.fn() };
    useCase = new PlatformDeleteUserUseCase(userRepository, ownershipTransactions, auditLogger);
  });

  it('throws UnauthorizedError for a non-SUPER_ADMIN caller and deletes nothing', async () => {
    await expect(del({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when the target does not exist', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(del()).rejects.toThrow(UserNotFoundError);
  });

  it('refuses to delete a SUPER_ADMIN account', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.SUPER_ADMIN, tenantId: null, email: 'admin@example.com' }));
    await expect(del({ confirmEmail: 'admin@example.com' })).rejects.toThrow(CannotModifySuperAdminError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('throws ConfirmationMismatchError when confirmEmail does not match, and deletes nothing', async () => {
    await expect(del({ confirmEmail: 'wrong@example.com' })).rejects.toThrow(ConfirmationMismatchError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes a STAFF member directly', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.STAFF }));
    await del();
    expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
    expect(auditLogger.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_DELETED', targetId: 'user-1' }));
  });

  it('deletes a Business Owner directly when they are the only user in the workspace', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
    userRepository.findActiveByTenantAndRole.mockResolvedValue([]);

    await del();

    expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
    expect(ownershipTransactions.promoteForDeletion).not.toHaveBeenCalled();
  });

  // Mirrors PlatformSuspendUserUseCase: with a co-owner left in charge there
  // is nothing to hand over.
  it('deletes a Business Owner with staff directly when a co-owner remains', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
    userRepository.findActiveByTenantAndRole.mockImplementation(async (_tenantId, role) =>
      role === UserRole.BUSINESS_OWNER
        ? [makeUser({ id: 'user-1', role: UserRole.BUSINESS_OWNER }), makeUser({ id: 'owner-2', role: UserRole.BUSINESS_OWNER })]
        : [makeUser({ id: 'staff-1', role: UserRole.STAFF })]
    );

    await del();

    expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
    expect(ownershipTransactions.promoteForDeletion).not.toHaveBeenCalled();
  });

  describe('sole Business Owner with active staff', () => {
    beforeEach(() => {
      userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
      userRepository.findActiveByTenantAndRole.mockImplementation(async (_tenantId, role) =>
        role === UserRole.BUSINESS_OWNER
          ? [makeUser({ id: 'user-1', role: UserRole.BUSINESS_OWNER })]
          : [makeUser({ id: 'staff-1', role: UserRole.STAFF })]
      );
    });

    it('requires newOwnerId and deletes nothing without it', async () => {
      await expect(del()).rejects.toThrow(OwnershipTransferRequiredError);
      expect(ownershipTransactions.promoteForDeletion).not.toHaveBeenCalled();
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });

    it('rejects a newOwnerId that is not an eligible staff member', async () => {
      await expect(del({ newOwnerId: 'not-staff' })).rejects.toThrow(InvalidOwnershipTargetError);
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });

    it('promotes the chosen staff member before deleting the owner', async () => {
      const callOrder: string[] = [];
      ownershipTransactions.promoteForDeletion.mockImplementation(async () => {
        callOrder.push('promote');
      });
      userRepository.softDelete.mockImplementation(async () => {
        callOrder.push('delete');
      });

      await del({ newOwnerId: 'staff-1' });

      expect(ownershipTransactions.promoteForDeletion).toHaveBeenCalledWith({ actingOwnerId: 'staff-1' });
      expect(callOrder).toEqual(['promote', 'delete']);
      expect(auditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OWNERSHIP_TRANSFERRED', targetId: 'staff-1' })
      );
      expect(auditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_DELETED', targetId: 'user-1' })
      );
    });
  });
});
