import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UserRole } from '../../domain/enums/UserRole';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';

export interface DeactivateUserDTO {
  access: AccessContext;
  /** Caller's id, so they cannot lock themselves out. */
  requestingUserId: string;
  /** Tenant resolved from the URL — the isolation boundary. */
  tenantId: string;
  userIdToDeactivate: string;
}

/**
 * Soft off-boarding for a staff member.
 *
 * Deactivation rather than deletion: seven non-nullable columns reference User
 * (Quotation.createdByUserId, Appointment.assignedUserId, Interaction.authorUserId,
 * Client.lastUpdatedByUserId, ...), so a delete is blocked by RESTRICT and
 * cascading would destroy financial and audit history. Same reasoning the
 * inventory module already applies in ProductInUseError.
 *
 * Existing assignments are deliberately left in place. Forcing reassignment
 * would rewrite Appointment.assignedUserId — a required column that cannot be
 * nulled — and so would falsify the record of who actually held the work. The
 * caller is shown the outstanding counts instead and can reassign separately.
 */
export class DeactivateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    /** D1: cleared so a still-valid token stops working on the deactivated user's next request. */
    private permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(dto: DeactivateUserDTO): Promise<{ userId: string }> {
    dto.access.ensure('users.manage');

    if (dto.userIdToDeactivate === dto.requestingUserId) {
      throw new Error('You cannot deactivate your own account.');
    }

    const target = await this.userRepository.findById(dto.userIdToDeactivate);
    if (!target) {
      throw new Error('User not found.');
    }

    // Tenant isolation enforced on the record itself, not just the route: a
    // valid owner token for tenant A must not deactivate a user in tenant B.
    if (target.tenantId !== dto.tenantId) {
      throw new Error('User not found.');
    }

    if (target.role === UserRole.BUSINESS_OWNER) {
      throw new Error('Business Owners cannot be deactivated.');
    }

    if (!target.isActive) {
      // Idempotent: already off-boarded is a success, not an error.
      return { userId: target.id };
    }

    await this.userRepository.setActive(dto.userIdToDeactivate, false);
    this.permissionsChanged?.userChanged(dto.userIdToDeactivate);
    return { userId: dto.userIdToDeactivate };
  }
}
