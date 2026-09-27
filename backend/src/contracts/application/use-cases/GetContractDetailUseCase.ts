import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { ContractStatus } from '../../domain/Contract';
import { canAccessContract } from './contractAccess';
import { PermissionDeniedError } from '../../../access/domain/errors';

/**
 * Everything one contract's page needs, including what the viewer is allowed
 * to do next.
 *
 * `permittedActions` is computed server-side for the same reason the invoice
 * module does it: the transition rules live in the entity, and a UI that
 * re-derives which buttons to show from the status string is a second copy of
 * those rules that drifts.
 */
export class GetContractDetailUseCase {
  constructor(
    private contractRepo: IContractRepository,
    private paymentRepo: IContractPaymentRepository,
    private historyRepo: IContractStatusHistoryRepository
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const contract = await this.contractRepo.findById(input.tenantId, input.contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (!canAccessContract(contract, input.access, 'contracts.validity.view')) {
      throw new PermissionDeniedError('contracts.validity.view', 'Unauthorized: you can only view your own contracts');
    }

    const payments = await this.paymentRepo.findByContractId(input.tenantId, input.contractId);
    const history = await this.historyRepo.findByContractId(input.tenantId, input.contractId);

    // A viewer who may read this contract but not manage it (Reception's
    // validity-only view) is offered no actions at all.
    const canAct = canAccessContract(contract, input.access, 'contracts.manage');
    const permittedActions = canAct ? actionsFor(contract.status) : [];

    return { contract, payments, history, permittedActions };
  }
}

function actionsFor(status: ContractStatus): string[] {
  switch (status) {
    case ContractStatus.Draft:
      return ['EDIT', 'ACTIVATE', 'CANCEL'];
    case ContractStatus.Active:
      return ['EDIT', 'CANCEL', 'RECORD_PAYMENT', 'ADD_PAYMENT'];
    case ContractStatus.Expired:
    case ContractStatus.Cancelled:
      // Terminal terms are read-only except for the money: an instalment
      // settled after a contract ended is a late payment, not an edit to the
      // deal, and refusing to record it would leave the books wrong.
      return ['RENEW', 'RECORD_PAYMENT'];
    default:
      return [];
  }
}
