import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractStatusHistoryRepository } from '../../domain/IContractStatusHistoryRepository';
import { CONTRACT_TRANSITIONS, ContractStatus } from '../../domain/Contract';
import { IContractDocumentRepository } from '../../domain/IContractDocumentRepository';
import { reachableContract } from './contractAccess';
import { admits } from '../../../access/domain/RecordScope';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { IContractRenewals } from '../ports/IContractRenewals';
import { EDIT_DEALS } from '../../../deals/application/dealAccess';

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
    private scopes: RecordScopeResolver,
    private renewals: IContractRenewals,
    private tenants: ITenantRepository
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const [readScope, manageScope, terminateScope, dealScope, tenant] = await Promise.all([
      this.scopes.resolve(input.access, 'contracts.validity.view'),
      this.scopes.resolve(input.access, 'contracts.manage'),
      this.scopes.resolve(input.access, 'contracts.terminate'),
      input.access.can(EDIT_DEALS) ? this.scopes.resolve(input.access, EDIT_DEALS) : Promise.resolve(null),
      this.tenants.findById(input.tenantId),
    ]);
    const contract = reachableContract(await this.contractRepo.findById(input.tenantId, input.contractId), readScope);

    const payments = await this.paymentRepo.findByContractId(input.tenantId, input.contractId);
    const history = await this.historyRepo.findByContractId(input.tenantId, input.contractId);

    // A viewer who may read this contract but not manage it (Reception's
    // validity-only view) is offered no actions at all. Suspending, reinstating
    // and cancelling a contract that has gone out need `contracts.terminate`.
    const owner = contract.clientAssignedUserId;
    const salesProcess = tenant?.runsSalesProcess() ?? false;
    const permittedActions = admits(manageScope, owner)
      ? actionsFor(contract.status, contract.isLegacy, input.access.can('contracts.terminate') && admits(terminateScope, owner), salesProcess)
      : [];

    // How this term is tied to the next and the previous one, and to an open renewal deal (FR-REN-06, 07, D9).
    const renewal = await this.renewals.links(input.tenantId, input.contractId);
    if (salesProcess) {
      // Starting a renewal takes the deals key as well, and a term that can still be renewed (FR-REN-06).
      const canStart =
        admits(manageScope, owner) &&
        dealScope !== null &&
        admits(dealScope, owner) &&
        RENEWABLE_STATUSES.includes(contract.status) &&
        !renewal.renewedInto &&
        !renewal.openDealId &&
        !contract.notRenewingReasonId;
      if (canStart) permittedActions.push('START_RENEWAL');
    }

    // Instalments are changed by `payments.update` alone (FR-PAY-05, FR-RBAC-24), which a
    // role may hold without managing contracts, so this is not part of the lifecycle actions.
    if (input.access.can('payments.update')) permittedActions.push('UPDATE_PAYMENTS');

    const documents = await this.documentRepo.findByContractId(input.tenantId, input.contractId);

    return { contract, payments, history, documents, permittedActions, renewal };
  }
}

/** The terms a renewal deal can be started from (FR-REN-06). */
const RENEWABLE_STATUSES: readonly ContractStatus[] = [ContractStatus.Active, ContractStatus.Suspended, ContractStatus.Expired];

function actionsFor(status: ContractStatus, legacy: boolean, canTerminate: boolean, salesProcess: boolean): string[] {
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
      // In the sales process a renewal is a deal, offered as START_RENEWAL by the caller (FR-REN-10).
      if (!salesProcess) actions.push('RENEW');
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
