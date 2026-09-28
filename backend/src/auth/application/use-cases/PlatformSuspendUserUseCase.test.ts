import { PlatformSuspendUserUseCase } from './PlatformSuspendUserUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IOwnershipTransactions } from '../ports/IOwnershipTransactions';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { OwnershipTransfer } from '../../domain/entities/OwnershipTransfer';
import {
  UnauthorizedError,
  UserNotFoundError,
  CannotModifySuperAdminError,
  OwnershipTransferRequiredError,
  InvalidOwnershipTargetError,
} from '../../domain/errors';

describe('PlatformSuspendUserUseCase', () => {
  let useCase: PlatformSuspendUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let ownershipTransactions: jest.Mocked<IOwnershipTransactions>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const TENANT = 'tenant-1';
  const CALLER = 'super-admin-1';

  const makeUser = (over: Partial<{ id: string; role: UserRole; tenantId: string | null; isActive: boolean; warehouseId: string | null }> = {}) =>
    User.create({
      id: over.id ?? 'user-1',
      email: `${over.id ?? 'user-1'}@example.com`,
      hashedPassword: 'h',
      role: over.role ?? UserRole.STAFF,
      tenantId: over.tenantId === undefined ? TENANT : over.tenantId,
      warehouseId: over.warehouseId ?? null,
      isActive: over.isActive ?? true,
      createdAt: new Date(),
    });

  const suspend = (over: any = {}) =>
    useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      callerId: CALLER,
      userId: 'user-1',
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
    useCase = new PlatformSuspendUserUseCase(userRepository, ownershipTransactions, auditLogger);
  });

  it('throws UnauthorizedError for a non-SUPER_ADMIN caller and touches nothing', async () => {
    await expect(suspend({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when the target does not exist', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(suspend()).rejects.toThrow(UserNotFoundError);
  });

  it('throws UserNotFoundError for an already-deleted user', async () => {
    userRepository.findById.mockResolvedValue(makeUser({}));
    (userRepository.findById as jest.Mock).mockResolvedValue(
      User.create({
        id: 'user-1',
        email: 'x@example.com',
        hashedPassword: 'h',
        role: UserRole.STAFF,
        tenantId: TENANT,
        isActive: false,
        deletedAt: new Date(),
        createdAt: new Date(),
      })
    );
    await expect(suspend()).rejects.toThrow(UserNotFoundError);
  });

  it('refuses to suspend a SUPER_ADMIN account', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.SUPER_ADMIN, tenantId: null }));
    await expect(suspend()).rejects.toThrow(CannotModifySuperAdminError);
    expect(userRepository.setActive).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-suspended user', async () => {
    const inactive = makeUser({ isActive: false });
    userRepository.findById.mockResolvedValue(inactive);

    const result = await suspend();
    expect(result.user).toBe(inactive);
    expect(userRepository.setActive).not.toHaveBeenCalled();
    expect(ownershipTransactions.promoteForSuspension).not.toHaveBeenCalled();
  });

  it('suspends a STAFF member directly', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.STAFF }));
    await suspend();
    expect(userRepository.setActive).toHaveBeenCalledWith('user-1', false);
    expect(auditLogger.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_SUSPENDED', targetId: 'user-1' }));
  });

  it('suspends a Business Owner directly when they are the only user in the workspace', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
    userRepository.findActiveByTenantAndRole.mockResolvedValue([]);

    await suspend();

    expect(userRepository.setActive).toHaveBeenCalledWith('user-1', false);
    expect(ownershipTransactions.promoteForSuspension).not.toHaveBeenCalled();
  });

  // A workspace may have several Business Owners; only the last one standing
  // has to hand it over. See `otherActiveOwners`.
  it('suspends a Business Owner with staff directly when a co-owner remains', async () => {
    userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
    userRepository.findActiveByTenantAndRole.mockImplementation(async (_tenantId, role) =>
      role === UserRole.BUSINESS_OWNER
        ? [makeUser({ id: 'user-1', role: UserRole.BUSINESS_OWNER }), makeUser({ id: 'owner-2', role: UserRole.BUSINESS_OWNER })]
        : [makeUser({ id: 'staff-1', role: UserRole.STAFF })]
    );

    await suspend();

    expect(userRepository.setActive).toHaveBeenCalledWith('user-1', false);
    expect(ownershipTransactions.promoteForSuspension).not.toHaveBeenCalled();
  });

  describe('sole Business Owner with active staff', () => {
    beforeEach(() => {
      userRepository.findById.mockResolvedValue(makeUser({ role: UserRole.BUSINESS_OWNER }));
      userRepository.findActiveByTenantAndRole.mockImplementation(async (_tenantId, role) =>
        role === UserRole.BUSINESS_OWNER
          ? [makeUser({ id: 'user-1', role: UserRole.BUSINESS_OWNER })]
          : [makeUser({ id: 'staff-1', role: UserRole.STAFF, warehouseId: 'wh-1' })]
      );
    });

    it('requires newOwnerId', async () => {
      await expect(suspend()).rejects.toThrow(OwnershipTransferRequiredError);
      expect(ownershipTransactions.promoteForSuspension).not.toHaveBeenCalled();
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('rejects a newOwnerId that is not an eligible staff member', async () => {
      await expect(suspend({ newOwnerId: 'not-staff' })).rejects.toThrow(InvalidOwnershipTargetError);
      expect(ownershipTransactions.promoteForSuspension).not.toHaveBeenCalled();
    });

    it('transfers ownership to the chosen staff member before suspending', async () => {
      ownershipTransactions.promoteForSuspension.mockResolvedValue(
        OwnershipTransfer.create({
          id: 'transfer-1',
          tenantId: TENANT,
          originalOwnerId: 'user-1',
          actingOwnerId: 'staff-1',
          previousActingRole: UserRole.STAFF,
          previousActingWarehouseId: 'wh-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          createdByUserId: CALLER,
          resolvedAt: null,
          resolvedByUserId: null,
        })
      );

      await suspend({ newOwnerId: 'staff-1' });

      expect(ownershipTransactions.promoteForSuspension).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          originalOwnerId: 'user-1',
          actingOwnerId: 'staff-1',
          actingOwnerRole: UserRole.STAFF,
          actingOwnerWarehouseId: 'wh-1',
          createdByUserId: CALLER,
        })
      );
      // The plain setActive path must not ALSO fire — the transaction port
      // already flipped the original owner inactive.
      expect(userRepository.setActive).not.toHaveBeenCalled();
      expect(auditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_SUSPENDED', metadata: expect.objectContaining({ ownershipTransferId: 'transfer-1' }) })
      );
    });
  });
});
