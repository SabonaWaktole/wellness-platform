import { AccessContext } from '../../access/domain/AccessContext';
import { Contract } from '../domain/Contract';

/**
 * What a viewer may see of a contract (FR-RBAC-06): fields a role may not
 * see are removed from the response, not merely hidden in the UI.
 *
 *   - Without `contracts.manage`, only the contract's validity — which plan,
 *     from when, until when, in what state (Reception's "contract validity").
 *   - Without `commercial.view`, no amount and none of the contract's other
 *     commercial fields: annual value, discount, package and services, terms,
 *     deal, offer, renewal date and signed document (FR-RBAC-21).
 *   - Without `payments.view`, no payment summary, payment rows or arrears.
 *
 * The CEO (read-only, but with commercial and payment data) therefore gets
 * validity plus the money, and Reception gets validity alone.
 */
const VALIDITY_FIELDS = [
  'id',
  'number',
  'clientId',
  'clientName',
  'planName',
  'status',
  'startsAt',
  'endsAt',
  'daysUntilExpiry',
] as const;

/**
 * The contract keys that need `commercial.view` (FR-RBAC-21). `dealId`,
 * `renewalDate` and `documentUrl` are ordinary words in other responses, so
 * they are removed here, in the one place that shapes a contract, rather than
 * by name from every response.
 */
const COMMERCIAL_CONTRACT_FIELDS = [
  'amount',
  'agreedAnnualValue',
  'discountPercent',
  'servicesSnapshot',
  'termsText',
  'packageId',
  'packageName',
  'quotationId',
  'quotationReference',
  'dealId',
  'dealTitle',
  'renewalDate',
  'documentUrl',
  'documentName',
] as const;

export type ContractView = Record<string, unknown>;

export function presentContract(contract: Contract, access: AccessContext): ContractView {
  const full = contract.toJSON() as ContractView;
  const view: ContractView = access.can('contracts.manage') ? { ...full } : pick(full, VALIDITY_FIELDS);

  if (access.can('commercial.view')) {
    // Validity-only viewers (no `contracts.manage`) never had these, so only the amount is added back.
    if (!access.can('contracts.manage')) view.amount = full.amount;
  } else {
    for (const key of COMMERCIAL_CONTRACT_FIELDS) delete view[key];
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
