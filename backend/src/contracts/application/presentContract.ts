import { AccessContext } from '../../access/domain/AccessContext';
import { Contract } from '../domain/Contract';

/**
 * What a viewer may see of a contract (FR-RBAC-06): fields a role may not
 * see are removed from the response, not merely hidden in the UI.
 *
 *   - Without `contracts.manage`, only the contract's validity — which plan,
 *     from when, until when, in what state (Reception's "contract validity").
 *   - Without `commercial.view`, no amount.
 *   - Without `payments.view`, no payment summary, payment rows or arrears.
 *
 * The CEO (read-only, but with commercial and payment data) therefore gets
 * validity plus the money, and Reception gets validity alone.
 */
const VALIDITY_FIELDS = [
  'id',
  'clientId',
  'clientName',
  'planName',
  'status',
  'startsAt',
  'endsAt',
  'daysUntilExpiry',
] as const;

export type ContractView = Record<string, unknown>;

export function presentContract(contract: Contract, access: AccessContext): ContractView {
  const full = contract.toJSON() as ContractView;
  const view: ContractView = access.can('contracts.manage') ? { ...full } : pick(full, VALIDITY_FIELDS);

  if (access.can('commercial.view')) {
    view.amount = full.amount;
  } else {
    delete view.amount;
  }
  if (access.can('payments.view')) {
    view.paymentSummary = full.paymentSummary;
  } else {
    delete view.paymentSummary;
  }
  return view;
}

export function presentContracts(contracts: Contract[], access: AccessContext): ContractView[] {
  return contracts.map((contract) => presentContract(contract, access));
}

/**
 * The contract page. Payment rows need `payments.view` — without it the
 * `payments` key is absent, not empty, so nothing named for payments reaches
 * the viewer. The status history is a manager's record.
 */
export function presentContractDetail<P, H>(
  detail: { contract: Contract; payments: P[]; history: H[]; permittedActions: string[] },
  access: AccessContext
) {
  const { payments, ...rest } = detail;
  return {
    ...rest,
    contract: presentContract(detail.contract, access),
    history: access.can('contracts.manage') ? detail.history : [],
    ...(access.can('payments.view') ? { payments } : {}),
  };
}

/** The contracts tab on a company. What the client owes needs `payments.view`. */
export function presentClientContracts<S extends { outstanding: number; overdueCount: number }>(
  result: { contracts: Contract[]; summary: S },
  access: AccessContext
) {
  const summary: Record<string, unknown> = { ...result.summary };
  if (!access.can('payments.view')) {
    delete summary.outstanding;
    delete summary.overdueCount;
  }
  return { contracts: presentContracts(result.contracts, access), summary };
}

function pick(source: ContractView, keys: readonly string[]): ContractView {
  const picked: ContractView = {};
  for (const key of keys) {
    if (key in source) picked[key] = source[key];
  }
  return picked;
}
