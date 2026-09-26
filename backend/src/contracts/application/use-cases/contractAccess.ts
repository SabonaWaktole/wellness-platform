import { UserRole } from '../../../auth/domain/enums/UserRole';
import { Contract } from '../../domain/Contract';

/**
 * Who may see and act on a contract.
 *
 * Staff are scoped to their own book of business — a contract they created or
 * one assigned to them. This is deliberately looser than the invoice rule
 * (creator only): contracts are ACCOUNTS, and accounts get handed over. A
 * salesperson who inherits a client must be able to work its contracts without
 * the original author staying involved forever, which is exactly what
 * `assignedUserId` is for.
 *
 * One function rather than the condition repeated in nine use cases: the
 * invoice module spells its rule out at every call site, and the cost of that
 * is that no two of them can be checked against each other.
 */
export const canAccessContract = (
  contract: Contract,
  actingUserId: string,
  actingUserRole: string
): boolean => {
  if (actingUserRole !== UserRole.STAFF) return true;
  return contract.createdByUserId === actingUserId || contract.assignedUserId === actingUserId;
};

export const assertCanAccessContract = (
  contract: Contract,
  actingUserId: string,
  actingUserRole: string
): void => {
  if (!canAccessContract(contract, actingUserId, actingUserRole)) {
    throw new Error('Unauthorized: Staff can only act on their own contracts');
  }
};
