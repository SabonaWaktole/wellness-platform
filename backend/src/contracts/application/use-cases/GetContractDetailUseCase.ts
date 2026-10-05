import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { CONTRACT_TRANSITIONS, ContractStatus } from '../../domain/Contract';
import { IContractDocumentRepository } from '../../domain/IContractDocumentRepository';
import { reachableContract } from './contractAccess';
import { admits } from '../../../access/domain/RecordScope';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

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
    private historyRepo: IContractStatusHistoryRepository,
    private documentRepo: IContractDocumentRepository,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const [readScope, manageScope, terminateScope] = await Promise.all([
      this.scopes.resolve(input.access, 'contracts.validity.view'),
      this.scopes.resolve(input.access, 'contracts.manage'),
      this.scopes.resolve(input.access, 'contracts.terminate'),
    ]);
    const contract = reachableContract(await this.contractRepo.findById(input.tenantId, input.contractId), readScope);

    const payments = await this.paymentRepo.findByContractId(input.tenantId, input.contractId);
    const history = await this.historyRepo.findByContractId(input.tenantId, input.contractId);

    // A viewer who may read this contract but not manage it (Reception's
    // validity-only view) is offered no actions at all. Suspending, reinstating
    // and cancelling a contract that has gone out need `contracts.terminate`.
    const owner = contract.clientAssignedUserId;
    const permittedActions = admits(manageScope, owner)
      ? actionsFor(contract.status, contract.isLegacy, input.access.can('contracts.terminate') && admits(terminateScope, owner))
      : [];

    // Instalments are changed by `payments.update` alone (FR-PAY-05, FR-RBAC-24), which a
    // role may hold without managing contracts, so this is not part of the lifecycle actions.
    if (input.access.can('payments.update')) permittedActions.push('UPDATE_PAYMENTS');

    const documents = await this.documentRepo.findByContractId(input.tenantId, input.contractId);

    return { contract, payments, history, documents, permittedActions };
  }
}

function actionsFor(status: ContractStatus, legacy: boolean, canTerminate: boolean): string[] {
  const actions: string[] = [];

  // The status moves the transition table allows from here, for the permission the person holds.
  for (const t of CONTRACT_TRANSITIONS) {
    if (t.from !== status || t.permission === 'system') continue;
    if (t.permission === 'contracts.terminate' && !canTerminate) continue;
    actions.push(STATUS_ACTION[`${t.from}>${t.to}`]);
  }

  switch (status) {
    case ContractStatus.Draft:
      // A contract made from a deal can be refreshed from it while it is a Draft (FR-CON-04).
      actions.unshift('EDIT', 'ATTACH_DOCUMENT');
      if (!legacy) actions.splice(2, 0, 'REFRESH_FROM_DEAL');
      break;
    case ContractStatus.PendingSignature:
      actions.unshift('EDIT', 'ATTACH_DOCUMENT');
      break;
    case ContractStatus.Active:
      actions.unshift('EDIT', 'ATTACH_DOCUMENT');
      break;
    case ContractStatus.Suspended:
      actions.unshift('EDIT', 'ATTACH_DOCUMENT');
      break;
    case ContractStatus.Expired:
    case ContractStatus.Cancelled:
      // Terminal terms are read-only; the money is not (UPDATE_PAYMENTS, below): an
      // instalment settled after a contract ended is a late payment, not an edit to the
      // deal, and refusing to record it would leave the books wrong.
      actions.push('RENEW');
      break;
  }
  return actions;
}

/** The button each allowed move is offered as. */
const STATUS_ACTION: Record<string, string> = {
  'DRAFT>PENDING_SIGNATURE': 'MARK_PENDING_SIGNATURE',
  'DRAFT>ACTIVE': 'ACTIVATE',
  'PENDING_SIGNATURE>ACTIVE': 'ACTIVATE',
  'ACTIVE>SUSPENDED': 'SUSPEND',
  'SUSPENDED>ACTIVE': 'REINSTATE',
  'DRAFT>CANCELLED': 'CANCEL',
  'PENDING_SIGNATURE>CANCELLED': 'CANCEL',
  'ACTIVE>CANCELLED': 'CANCEL',
  'SUSPENDED>CANCELLED': 'CANCEL',
};
