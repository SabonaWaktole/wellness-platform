import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { InvalidReassignmentTargetError, ReassignmentRequiredError } from '../../domain/errors';
import { IPermissionsChanged } from '../../../access/application/ports/IPermissionsChanged';
import { RoleManagementGuard } from '../../../access/application/RoleManagementGuard';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { IUserAdminTransaction } from '../ports/IUserAdminTransaction';
import { userLabel } from '../userAudit';

export interface DeactivateUserDTO {
  access: AccessContext;
  /** Caller's id, so they cannot lock themselves out. */
  requestingUserId: string;
  /** Tenant resolved from the URL — the isolation boundary. */
  tenantId: string;
  userIdToDeactivate: string;
  /** The colleague who takes over the user's companies and open contracts (FR-USR-05). */
  reassignToUserId?: string | null;
}

/**
 * Soft off-boarding for a staff member (FR-USR-04, 05).
 *
 * Deactivation rather than deletion: seven non-nullable columns reference User,
 * so a delete is blocked by RESTRICT and cascading would destroy financial and
 * audit history.
 *
 * Companies are never left without a salesperson: a user who still has any
 * cannot be deactivated until a colleague is named, and the companies and their
 * open contracts move to that colleague in the same transaction. Appointments
 * stay with whoever held them, because `Appointment.assignedUserId` records
 * who actually did the work.
 */
export class DeactivateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly guard: RoleManagementGuard,
    private readonly writeTx: IUserAdminTransaction,
    /** D1: cleared so a still-valid token stops working on the deactivated user's next request. */
    private readonly permissionsChanged?: IPermissionsChanged
  ) {}

  async execute(dto: DeactivateUserDTO): Promise<{ userId: string; reassigned: { companies: number; contracts: number } }> {
    dto.access.ensure('users.manage');

    if (dto.userIdToDeactivate === dto.requestingUserId) {
      throw new Error('You cannot deactivate your own account.');
    }

    const target = await this.userRepository.findById(dto.userIdToDeactivate);
    // Tenant isolation enforced on the record itself, not just the route.
    if (!target || target.tenantId !== dto.tenantId) {
      throw new Error('User not found.');
    }

    if (!target.isActive) {
      return { userId: target.id, reassigned: { companies: 0, contracts: 0 } };
    }

    await this.guard.ensureNotLastManager(dto.tenantId, target.id);

    const successorId = dto.reassignToUserId ?? null;
    if (successorId) {
      const successor = successorId === target.id ? null : await this.userRepository.findById(successorId);
      if (!successor || successor.tenantId !== dto.tenantId || !successor.isActive) {
        throw new InvalidReassignmentTargetError();
      }
    } else {
      const { clients } = await this.userRepository.countAssignedWork(target.id);
      if (clients > 0) {
        throw new ReassignmentRequiredError(clients);
      }
    }

    const actor = { tenantId: dto.tenantId, userId: dto.access.userId, userRole: dto.access.auditRole };
    const reassigned = await this.writeTx.run(async ({ staff, assignments, auditTrail }) => {
      const moved = { companies: 0, contracts: 0 };
      if (successorId) {
        const assignee = [{ field: 'assignedUserId', old: target.id, new: successorId }];
        const companies = await assignments.reassignCompanies(dto.tenantId, target.id, successorId);
        for (const company of companies) {
          await auditTrail.record({ ...actor, action: AuditAction.Update, entityType: 'Client', entityId: company.id, entityLabel: company.label, changes: assignee });
        }
        const contracts = await assignments.reassignOpenContracts(dto.tenantId, target.id, successorId);
        for (const contract of contracts) {
          await auditTrail.record({ ...actor, action: AuditAction.Update, entityType: 'Contract', entityId: contract.id, entityLabel: contract.label, changes: assignee });
        }
        moved.companies = companies.length;
        moved.contracts = contracts.length;
      }

      await staff.setActive(dto.tenantId, target.id, false);
      await auditTrail.record({
        ...actor,
        action: AuditAction.StatusChange,
        entityType: 'User',
        entityId: target.id,
        entityLabel: userLabel(target),
        changes: [{ field: 'isActive', old: true, new: false }],
      });
      return moved;
    });

    this.permissionsChanged?.userChanged(target.id);
    return { userId: target.id, reassigned };
  }
}
