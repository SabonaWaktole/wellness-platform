import { admits, RecordScope } from '../../../access/domain/RecordScope';
import { Contract } from '../../domain/Contract';

/** Reads check `contracts.validity.view`; writes check `contracts.manage`. */
export type ContractPermission = 'contracts.validity.view' | 'contracts.manage';

/**
 * A contract belongs to whoever its company belongs to (FR-RBAC-11: "Own"
 * is the user's companies and their contracts). One outside the viewer's
 * scope is "not found", exactly like one that does not exist (FR-RBAC-05:
 * 404, not 403). One function rather than the condition repeated in every
 * use case, so no two of them can drift apart.
 */
export const reachableContract = (contract: Contract | null, scope: RecordScope): Contract => {
  if (!contract || !admits(scope, contract.clientAssignedUserId)) {
    throw new Error('Contract not found');
  }
  return contract;
};
