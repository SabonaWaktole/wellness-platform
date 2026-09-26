import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { ContractStatus } from '../../domain/Contract';
import { canAccessContract } from './contractAccess';

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
    actingUserRole: string;
  }) {
    const contract = await this.contractRepo.findById(input.tenantId, input.contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    const canAct = canAccessContract(contract, input.actingUserId, input.actingUserRole);
    if (!canAct) {
      throw new Error('Unauthorized: Staff can only view their own contracts');
    }

    const payments = await this.paymentRepo.findByContractId(input.tenantId, input.contractId);
    const history = await this.historyRepo.findByContractId(input.tenantId, input.contractId);

    const permittedActions: string[] = [];
    switch (contract.status) {
      case ContractStatus.Draft:
        permittedActions.push('EDIT', 'ACTIVATE', 'CANCEL');
        break;
      case ContractStatus.Active:
        permittedActions.push('EDIT', 'CANCEL', 'RECORD_PAYMENT', 'ADD_PAYMENT');
        break;
      case ContractStatus.Expired:
      case ContractStatus.Cancelled:
        // Terminal terms are read-only except for the money: an instalment
        // settled after a contract ended is a late payment, not an edit to the
        // deal, and refusing to record it would leave the books wrong.
        permittedActions.push('RENEW', 'RECORD_PAYMENT');
        break;
    }

    return { contract, payments, history, permittedActions };
  }
}
