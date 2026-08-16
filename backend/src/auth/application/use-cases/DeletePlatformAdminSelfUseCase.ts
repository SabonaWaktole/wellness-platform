import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError, UserNotFoundError, LastPlatformAdminError } from '../../domain/errors';
import { ConfirmationMismatchError } from '../../../shared/domain/errors/ConfirmationMismatchError';

export interface DeletePlatformAdminSelfDTO {
  callerRole: string;
  callerId: string;
  /** The caller's own current email, typed back — same pattern as PlatformDeleteUserUseCase. */
  confirmEmail: string;
}

/**
 * A platform administrator closing their OWN account.
 *
 * Self-only by construction: the target is `callerId`, never a parameter, so
 * there is no id an admin could pass to remove a colleague. That is the whole
 * reason this is a separate use case rather than a relaxation of
 * `PlatformDeleteUserUseCase` — the latter takes a `userId`, and letting it
 * accept SUPER_ADMIN targets would mean any one admin could unilaterally strip
 * every other admin, turning a shared role into a race. Here the only account
 * anyone can close is the one they are signed in as.
 *
 * Refuses when the caller is the last one standing (`LastPlatformAdminError`).
 * Nothing inside the application can create a SUPER_ADMIN except another
 * SUPER_ADMIN, so an empty set is terminal: recovery would mean running
 * `scratch/seed-super-admin.ts` against the database by hand. The count is
 * taken here rather than trusted from the client for the obvious reason.
 *
 * Soft-delete, like every other removal in this codebase — seven non-nullable
 * columns reference User, so a row removal is blocked by FK RESTRICT. See
 * `IUserRepository.softDelete`.
 */
export class DeletePlatformAdminSelfUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly auditLogger: IAuditLogger
  ) {}

  async execute(dto: DeletePlatformAdminSelfDTO): Promise<void> {
    if (dto.callerRole !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Only platform administrators can close a platform account');
    }

    const self = await this.userRepository.findById(dto.callerId);
    if (!self || self.deletedAt) {
      throw new UserNotFoundError(dto.callerId);
    }

    /*
     * The token said SUPER_ADMIN; the record is what decides.
     *
     * A token stays valid for up to an hour after the account behind it changed
     * (TD-010), so a role read from the token alone can be stale. Re-reading
     * means someone demoted a minute ago cannot still spend the privilege.
     */
    if (self.role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Only platform administrators can close a platform account');
    }

    if (dto.confirmEmail !== self.email) {
      throw new ConfirmationMismatchError();
    }

    // Counted AFTER the confirmation check, so a mistyped email fails on the
    // mistype rather than on a platform-state error that would read as though
    // the typing had been accepted.
    const admins = await this.userRepository.countActivePlatformAdmins();
    if (admins <= 1) {
      throw new LastPlatformAdminError();
    }

    await this.userRepository.softDelete(dto.callerId);

    // Recorded with the pre-deletion email: `softDelete` anonymizes the column,
    // so reading it afterwards would log `deleted-<id>@deleted.invalid` and lose
    // the one detail that makes the entry useful.
    await this.auditLogger.record({
      actorUserId: dto.callerId,
      actorRole: dto.callerRole,
      action: 'PLATFORM_ADMIN_SELF_DELETED',
      targetType: 'USER',
      targetId: dto.callerId,
      tenantId: null,
      metadata: { email: self.email, remainingPlatformAdmins: admins - 1 },
    });
  }
}
