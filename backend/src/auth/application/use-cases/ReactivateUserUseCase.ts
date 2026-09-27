import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';
import { UnauthorizedError } from '../../domain/errors';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';

export interface ReactivateUserDTO {
  /** Role of the caller, for authorization. */
  requestingUserRole: string;
  /** Tenant resolved from the URL — the isolation boundary. */
  tenantId: string;
  userIdToReactivate: string;
}

/**
 * Restores a previously deactivated staff member's access.
 *
 * The counterpart to DeactivateUserUseCase, and the reason TD-030 grew beyond a
 * labelling fix: `setActive` has always accepted a boolean, but nothing in the
 * product ever passed `true`. Deactivation was one-way. A Business Owner who
 * off-boarded the wrong person could not undo it, which quietly contradicted
 * the confirmation copy's promise that the account is kept rather than deleted
 * — kept, but unreachable, is not much of a promise.
 *
 * Deliberately does NOT restore anything else. Deactivation leaves clients and
 * appointments assigned where they were, so reactivation has nothing to put
 * back; the member simply becomes able to sign in again. The one thing that can
 * differ is `warehouseId`: if their warehouse was deleted while they were
 * inactive, the optional FK has already been nulled, so they return with no
 * warehouse scope rather than a dangling one. That is visible in Team Settings
 * and correctable there.
 */
export class ReactivateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    /** D1: cleared so the account's next request is resolved fresh rather than from a stale (pre-reactivation) cache entry. */
    private permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(dto: ReactivateUserDTO): Promise<{ userId: string }> {
    if (dto.requestingUserRole !== UserRole.BUSINESS_OWNER) {
      throw new UnauthorizedError('Only Business Owners can reactivate team members.');
    }

    const target = await this.userRepository.findById(dto.userIdToReactivate);
    if (!target) {
      throw new Error('User not found.');
    }

    // Tenant isolation enforced on the record itself, not just the route: a
    // valid owner token for tenant A must not reactivate a user in tenant B.
    // Without this, reactivation would be a way back in that deactivation
    // itself guards against.
    if (target.tenantId !== dto.tenantId) {
      throw new Error('User not found.');
    }

    if (target.isActive) {
      // Idempotent, matching deactivation: already active is a success.
      return { userId: target.id };
    }

    await this.userRepository.setActive(dto.userIdToReactivate, true);
    this.permissionsChanged?.userChanged(dto.userIdToReactivate);
    return { userId: dto.userIdToReactivate };
  }
}
