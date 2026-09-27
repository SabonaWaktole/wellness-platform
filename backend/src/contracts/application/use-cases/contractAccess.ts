import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { Contract } from '../../domain/Contract';

/** Reads check `contracts.validity.view`; writes check `contracts.manage`. */
export type ContractPermission = 'contracts.validity.view' | 'contracts.manage';

/**
 * Who may see and act on a contract.
 *
 * A caller holding `key` at OWN scope is limited to their own book of
 * business — a contract they created or one assigned to them. This is
 * deliberately looser than the invoice rule (creator only): contracts are
 * ACCOUNTS, and accounts get handed over. A salesperson who inherits a client
 * must be able to work its contracts without the original author staying
 * involved forever, which is exactly what `assignedUserId` is for.
 *
 * One function rather than the condition repeated in nine use cases: the
 * invoice module spells its rule out at every call site, and the cost of that
 * is that no two of them can be checked against each other.
 */
export const canAccessContract = (
  contract: Contract,
  access: AccessContext,
  key: ContractPermission = 'contracts.manage'
): boolean =>
  access.reaches(key, [contract.createdByUserId, contract.assignedUserId]);

export const assertCanAccessContract = (
  contract: Contract,
  access: AccessContext,
  key: ContractPermission = 'contracts.manage'
): void => {
  if (!canAccessContract(contract, access, key)) {
    throw new PermissionDeniedError(key, 'Unauthorized: you can only act on your own contracts');
  }
};
