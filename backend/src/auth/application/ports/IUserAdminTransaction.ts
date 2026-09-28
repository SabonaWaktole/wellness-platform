import { User } from '../../domain/entities/User';
import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';

export interface IStaffWrites {
  create(user: User): Promise<void>;
  setRole(tenantId: string, userId: string, change: { roleId: string; legacyRole: string; warehouseId: string | null }): Promise<void>;
  setActive(tenantId: string, userId: string, isActive: boolean): Promise<void>;
}

export interface ReassignedRecord {
  id: string;
  label: string;
}

/** Hands a departing user's book of work to a colleague (FR-USR-05). */
export interface IAssignmentTransfer {
  /** Every non-archived company assigned to `fromUserId`, now assigned to `toUserId`. */
  reassignCompanies(tenantId: string, fromUserId: string, toUserId: string): Promise<ReassignedRecord[]>;
  /** Every DRAFT or ACTIVE contract assigned to `fromUserId`, now assigned to `toUserId`. */
  reassignOpenContracts(tenantId: string, fromUserId: string, toUserId: string): Promise<ReassignedRecord[]>;
}

export interface UserAdminRepos {
  staff: IStaffWrites;
  invitations: IInvitationRepository;
  assignments: IAssignmentTransfer;
  auditTrail: IAuditTrail;
}

/**
 * One transaction for a user-administration write and its audit entries
 * (FR-AUD-04): if the audit write fails, the role change, deactivation or
 * reassignment rolls back with it.
 */
export interface IUserAdminTransaction {
  run<T>(work: (repos: UserAdminRepos) => Promise<T>): Promise<T>;
}
