import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { userLabel } from '../userAudit';

export interface ReactivateUserDTO {
  access: AccessContext;
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
 * Deliberately does NOT restore anything else. Companies and open contracts
 * were handed to a colleague on deactivation (FR-USR-05) and stay with them;
 * the member simply becomes able to sign in again. The one thing that can
 * differ is `warehouseId`: if their warehouse was deleted while they were
 * inactive, the optional FK has already been nulled, so they return with no
 * warehouse scope rather than a dangling one. That is visible in Team Settings
 * and correctable there.
 */
export class ReactivateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private writeTx: IUserAdminTransaction,
    /** D1: cleared so the account's next request is resolved fresh rather than from a stale (pre-reactivation) cache entry. */
    private permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(dto: ReactivateUserDTO): Promise<{ userId: string }> {
    dto.access.ensure('users.manage');

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

    await this.writeTx.run(async ({ staff, auditTrail }) => {
      await staff.setActive(dto.tenantId, target.id, true);
      await auditTrail.record({
        tenantId: dto.tenantId,
        userId: dto.access.userId,
        userRole: dto.access.auditRole,
        action: AuditAction.StatusChange,
        entityType: 'User',
        entityId: target.id,
        entityLabel: userLabel(target),
        changes: [{ field: 'isActive', old: false, new: true }],
      });
    });
    this.permissionsChanged?.userChanged(dto.userIdToReactivate);
    return { userId: dto.userIdToReactivate };
  }
}
