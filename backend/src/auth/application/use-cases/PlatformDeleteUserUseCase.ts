import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IOwnershipTransactions } from '../ports/IOwnershipTransactions';
import { IAuditLogger } from '../../../shared/application/ports/IAuditLogger';
import { UserRole } from '../../domain/enums/UserRole';
import {
  UnauthorizedError,
  UserNotFoundError,
  CannotModifySuperAdminError,
  OwnershipTransferRequiredError,
  InvalidOwnershipTargetError,
} from '../../domain/errors';
import { ConfirmationMismatchError } from '../../../shared/domain/errors/ConfirmationMismatchError';
import { otherActiveOwners } from '../../domain/services/ownership';

export interface PlatformDeleteUserDTO {
  callerRole: string;
  callerId: string;
  userId: string;
  /** The target's own current email, typed back to confirm — see ConfirmationMismatchError. */
  confirmEmail: string;
  /** Required only when the target is a Business Owner with other active staff. */
  newOwnerId?: string;
}

/**
 * Permanently (soft-)deletes any account — Business Owner or Staff.
 *
 * Irreversible, unlike `PlatformSuspendUserUseCase`: there is no
 * "un-delete". The LAST active Business Owner of a workspace that still has
 * staff must first hand it to one of them, exactly like suspension, except
 * the handover has no transfer record to resolve later — the original owner
 * is gone for good. An owner with co-owners is deleted outright.
 *
 * "Delete" is a soft delete (`IUserRepository.softDelete`), not a row
 * removal: seven non-nullable columns reference User, so a hard delete is
 * blocked by Postgres RESTRICT — the same reason `DeactivateUserUseCase`
 * never removes a row either.
 */
export class PlatformDeleteUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly ownershipTransactions: IOwnershipTransactions,
    private readonly auditLogger: IAuditLogger
  ) {}

  async execute(dto: PlatformDeleteUserDTO): Promise<void> {
    if (dto.callerRole !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedError('Only Super Admins can delete a user');
    }

    const target = await this.userRepository.findById(dto.userId);
    if (!target || target.deletedAt) {
      throw new UserNotFoundError(dto.userId);
    }
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new CannotModifySuperAdminError();
    }

    if (dto.confirmEmail !== target.email) {
      throw new ConfirmationMismatchError();
    }

    let ownershipTransferred = false;

    if (target.role === UserRole.BUSINESS_OWNER && target.tenantId) {
      // Same rule as `PlatformSuspendUserUseCase`: only the LAST active
      // Business Owner has to hand the workspace over. Co-owners are the
      // normal case, not an anomaly — see `otherActiveOwners`.
      const owners = await this.userRepository.findActiveByTenantAndRole(
        target.tenantId,
        UserRole.BUSINESS_OWNER
      );
      const coOwners = otherActiveOwners(owners, target.id);

      const staff =
        coOwners.length > 0
          ? []
          : await this.userRepository.findActiveByTenantAndRole(target.tenantId, UserRole.STAFF);

      if (staff.length > 0) {
        if (!dto.newOwnerId) {
          throw new OwnershipTransferRequiredError();
        }
        const actingOwner = staff.find((s) => s.id === dto.newOwnerId);
        if (!actingOwner) {
          throw new InvalidOwnershipTargetError();
        }

        await this.ownershipTransactions.promoteForDeletion({ actingOwnerId: actingOwner.id });
        ownershipTransferred = true;

        await this.auditLogger.record({
          actorUserId: dto.callerId,
          actorRole: dto.callerRole,
          action: 'OWNERSHIP_TRANSFERRED',
          targetType: 'USER',
          targetId: actingOwner.id,
          tenantId: target.tenantId,
          metadata: { reason: 'DELETION', previousOwnerId: target.id },
        });
      }
    }

    await this.userRepository.softDelete(dto.userId);

    await this.auditLogger.record({
      actorUserId: dto.callerId,
      actorRole: dto.callerRole,
      action: 'USER_DELETED',
      targetType: 'USER',
      targetId: dto.userId,
      tenantId: target.tenantId,
      metadata: {
        targetEmail: target.email,
        ...(ownershipTransferred ? { newOwnerId: dto.newOwnerId } : {}),
      },
    });
  }
}
