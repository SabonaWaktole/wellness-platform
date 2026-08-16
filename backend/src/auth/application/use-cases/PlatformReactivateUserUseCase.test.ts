import { PlatformReactivateUserUseCase, OwnershipResolution } from './PlatformReactivateUserUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IOwnershipTransferRepository } from '../../domain/repositories/IOwnershipTransferRepository';
import { IOwnershipTransactions } from '../ports/IOwnershipTransactions';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { OwnershipTransfer } from '../../domain/entities/OwnershipTransfer';
import {
  UnauthorizedError,
  UserNotFoundError,
  CannotModifySuperAdminError,
  RestoreOwnershipChoiceRequiredError,
} from '../../domain/errors';

describe('PlatformReactivateUserUseCase', () => {
  let useCase: PlatformReactivateUserUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let ownershipTransferRepository: jest.Mocked<IOwnershipTransferRepository>;
  let ownershipTransactions: jest.Mocked<IOwnershipTransactions>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const TENANT = 'tenant-1';
  const CALLER = 'super-admin-1';

  const makeUser = (over: Partial<{ id: string; role: UserRole; isActive: boolean; deletedAt: Date | null }> = {}) =>
    User.create({
      id: over.id ?? 'user-1',
      email: `${over.id ?? 'user-1'}@example.com`,
      hashedPassword: 'h',
      role: over.role ?? UserRole.BUSINESS_OWNER,
      tenantId: TENANT,
      isActive: over.isActive ?? false,
      deletedAt: over.deletedAt ?? null,
      createdAt: new Date(),
    });

  const activeTransfer = () =>
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
    });

  const reactivate = (over: any = {}) =>
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
      updateRoleAndWarehouse: jest.fn(),
      setActive: jest.fn(),
      softDelete: jest.fn(),
      countAssignedWork: jest.fn(),
      findActiveByTenantAndRole: jest.fn().mockResolvedValue([]),
      findPlatformUsers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      countActivePlatformAdmins: jest.fn().mockResolvedValue(1),
    };
    ownershipTransferRepository = {
      findById: jest.fn(),
      findActiveByOriginalOwnerId: jest.fn().mockResolvedValue(null),
      findActiveByActingOwnerId: jest.fn(),
    };
    ownershipTransactions = {
      promoteForSuspension: jest.fn(),
      restoreOwnership: jest.fn(),
      keepOwnership: jest.fn(),
      keepBothOwners: jest.fn(),
      promoteForDeletion: jest.fn(),
    };
    auditLogger = { record: jest.fn(), findRecent: jest.fn() };
    useCase = new PlatformReactivateUserUseCase(
      userRepository,
      ownershipTransferRepository,
      ownershipTransactions,
      auditLogger
    );
  });

  it('throws UnauthorizedError for a non-SUPER_ADMIN caller', async () => {
    await expect(reactivate({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when the target does not exist', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(reactivate()).rejects.toThrow(UserNotFoundError);
  });

  it('refuses to reactivate a SUPER_ADMIN account', async () => {
    userRepository.findById.mockResolvedValue(
      User.create({
        id: 'user-1',
        email: 'admin@example.com',
        hashedPassword: 'h',
        role: UserRole.SUPER_ADMIN,
        tenantId: null,
        isActive: false,
        createdAt: new Date(),
      })
    );
    await expect(reactivate()).rejects.toThrow(CannotModifySuperAdminError);
  });

  it('is idempotent for an already-active user', async () => {
    const active = makeUser({ isActive: true });
    userRepository.findById.mockResolvedValue(active);

    const result = await reactivate();
    expect(result.user).toBe(active);
    expect(userRepository.setActive).not.toHaveBeenCalled();
    expect(ownershipTransferRepository.findActiveByOriginalOwnerId).not.toHaveBeenCalled();
  });

  it('reactivates a plain suspension with no ownership transfer', async () => {
    ownershipTransferRepository.findActiveByOriginalOwnerId.mockResolvedValue(null);

    await reactivate();

    expect(userRepository.setActive).toHaveBeenCalledWith('user-1', true);
    expect(ownershipTransactions.restoreOwnership).not.toHaveBeenCalled();
    expect(ownershipTransactions.keepOwnership).not.toHaveBeenCalled();
  });

  describe('with an unresolved ownership transfer', () => {
    beforeEach(() => {
      ownershipTransferRepository.findActiveByOriginalOwnerId.mockResolvedValue(activeTransfer());
      userRepository.findById.mockImplementation(async (id: string) => {
        if (id === 'user-1') return makeUser();
        if (id === 'staff-1') return makeUser({ id: 'staff-1', role: UserRole.BUSINESS_OWNER, isActive: true });
        return null;
      });
    });

    it('requires an explicit ownershipResolution choice', async () => {
      await expect(reactivate()).rejects.toThrow(RestoreOwnershipChoiceRequiredError);
      expect(ownershipTransactions.restoreOwnership).not.toHaveBeenCalled();
      expect(ownershipTransactions.keepOwnership).not.toHaveBeenCalled();
      expect(ownershipTransactions.keepBothOwners).not.toHaveBeenCalled();
    });

    it('restores original ownership when chosen', async () => {
      await reactivate({ ownershipResolution: OwnershipResolution.RESTORE });
      expect(ownershipTransactions.restoreOwnership).toHaveBeenCalledWith('transfer-1', CALLER);
      expect(userRepository.setActive).not.toHaveBeenCalled();
    });

    it('keeps the acting owner when chosen', async () => {
      await reactivate({ ownershipResolution: OwnershipResolution.KEEP });
      expect(ownershipTransactions.keepOwnership).toHaveBeenCalledWith('transfer-1', CALLER);
    });

    it('keeps BOTH as Business Owners when chosen, demoting neither', async () => {
      await reactivate({ ownershipResolution: OwnershipResolution.KEEP_BOTH });

      expect(ownershipTransactions.keepBothOwners).toHaveBeenCalledWith('transfer-1', CALLER);
      expect(ownershipTransactions.restoreOwnership).not.toHaveBeenCalled();
      expect(ownershipTransactions.keepOwnership).not.toHaveBeenCalled();
      expect(userRepository.setActive).not.toHaveBeenCalled();
      expect(auditLogger.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_REACTIVATED',
          metadata: expect.objectContaining({ resolution: 'KEEP_BOTH' }),
        })
      );
    });

    describe('when the acting owner is no longer active', () => {
      beforeEach(() => {
        userRepository.findById.mockImplementation(async (id: string) => {
          if (id === 'user-1') return makeUser();
          if (id === 'staff-1') return makeUser({ id: 'staff-1', role: UserRole.BUSINESS_OWNER, isActive: false });
          return null;
        });
      });

      it('refuses to restore', async () => {
        await expect(reactivate({ ownershipResolution: OwnershipResolution.RESTORE })).rejects.toThrow(
          RestoreOwnershipChoiceRequiredError
        );
        expect(ownershipTransactions.restoreOwnership).not.toHaveBeenCalled();
      });

      // "Keep both" is a statement about the stand-in as much as about the
      // person coming back; with no stand-in left it is not a choice that
      // means anything.
      it('refuses to keep both', async () => {
        await expect(reactivate({ ownershipResolution: OwnershipResolution.KEEP_BOTH })).rejects.toThrow(
          RestoreOwnershipChoiceRequiredError
        );
        expect(ownershipTransactions.keepBothOwners).not.toHaveBeenCalled();
      });

      // KEEP only demotes the person being reactivated, so it still resolves
      // the transfer whatever happened to the acting owner.
      it('still allows keeping the acting owner', async () => {
        await reactivate({ ownershipResolution: OwnershipResolution.KEEP });
        expect(ownershipTransactions.keepOwnership).toHaveBeenCalledWith('transfer-1', CALLER);
      });
    });
  });
});
