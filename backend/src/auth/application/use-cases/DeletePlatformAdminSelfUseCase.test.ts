import { DeletePlatformAdminSelfUseCase } from './DeletePlatformAdminSelfUseCase';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { User } from '../../domain/entities/User';
import { UnauthorizedError, UserNotFoundError, LastPlatformAdminError } from '../../domain/errors';
import { ConfirmationMismatchError } from '../../../shared/domain/errors/ConfirmationMismatchError';

describe('DeletePlatformAdminSelfUseCase', () => {
  let useCase: DeletePlatformAdminSelfUseCase;
  let userRepository: jest.Mocked<IUserRepository>;
  let auditLogger: jest.Mocked<IAuditLogger>;

  const CALLER = 'super-admin-1';
  const EMAIL = 'admin@example.com';

  const makeAdmin = (over: Partial<{ role: UserRole; deletedAt: Date | null }> = {}) =>
    User.create({
      id: CALLER,
      email: EMAIL,
      hashedPassword: 'h',
      role: over.role ?? UserRole.SUPER_ADMIN,
      tenantId: over.role && over.role !== UserRole.SUPER_ADMIN ? 'tenant-1' : null,
      deletedAt: over.deletedAt ?? null,
      isActive: true,
      createdAt: new Date(),
    });

  const close = (over: any = {}) =>
    useCase.execute({
      callerRole: UserRole.SUPER_ADMIN,
      callerId: CALLER,
      confirmEmail: EMAIL,
      ...over,
    });

  beforeEach(() => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(makeAdmin()),
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
      // Two admins: the caller and one other, so the happy path is the default.
      countActivePlatformAdmins: jest.fn().mockResolvedValue(2),
    };
    auditLogger = { record: jest.fn(), findRecent: jest.fn() };
    useCase = new DeletePlatformAdminSelfUseCase(userRepository, auditLogger);
  });

  it('refuses a non-SUPER_ADMIN caller', async () => {
    await expect(close({ callerRole: UserRole.BUSINESS_OWNER })).rejects.toThrow(UnauthorizedError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('refuses when the STORED role is no longer SUPER_ADMIN, even if the token says it is', async () => {
    // A token outlives a role change by up to an hour (TD-010), so the record
    // has the final say rather than the claim the caller arrived with.
    userRepository.findById.mockResolvedValue(makeAdmin({ role: UserRole.BUSINESS_OWNER }));
    await expect(close()).rejects.toThrow(UnauthorizedError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when the account is already gone', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(close()).rejects.toThrow(UserNotFoundError);
  });

  it('treats an already soft-deleted account as not found', async () => {
    userRepository.findById.mockResolvedValue(makeAdmin({ deletedAt: new Date() }));
    await expect(close()).rejects.toThrow(UserNotFoundError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('requires the caller to type their own email back', async () => {
    await expect(close({ confirmEmail: 'wrong@example.com' })).rejects.toThrow(
      ConfirmationMismatchError
    );
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('reports a mistyped email as a mismatch rather than a platform-state error', async () => {
    // Ordering matters: with one admin left AND a typo, the caller should be
    // told about the typo — the other message would imply the typing was fine.
    userRepository.countActivePlatformAdmins.mockResolvedValue(1);
    await expect(close({ confirmEmail: 'wrong@example.com' })).rejects.toThrow(
      ConfirmationMismatchError
    );
  });

  it('refuses when the caller is the only platform admin left', async () => {
    userRepository.countActivePlatformAdmins.mockResolvedValue(1);
    await expect(close()).rejects.toThrow(LastPlatformAdminError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('refuses when the count somehow reports zero', async () => {
    // Defensive: `<= 1`, not `=== 1`. A zero here means the platform is already
    // in the unrecoverable state, and deleting further cannot be the answer.
    userRepository.countActivePlatformAdmins.mockResolvedValue(0);
    await expect(close()).rejects.toThrow(LastPlatformAdminError);
    expect(userRepository.softDelete).not.toHaveBeenCalled();
  });

  it('closes the account when another admin remains', async () => {
    await close();
    expect(userRepository.softDelete).toHaveBeenCalledWith(CALLER);
  });

  it('audits with the pre-deletion email, which softDelete would otherwise anonymize', async () => {
    await close();

    expect(auditLogger.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLATFORM_ADMIN_SELF_DELETED',
        actorUserId: CALLER,
        targetId: CALLER,
        tenantId: null,
        metadata: expect.objectContaining({ email: EMAIL, remainingPlatformAdmins: 1 }),
      })
    );
  });
});
