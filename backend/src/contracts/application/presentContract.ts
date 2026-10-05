import { AccessContext } from '../../access/domain/AccessContext';
import { Contract } from '../domain/Contract';
import { ValidityClock } from './ContractValidityBadges';
import { validityBadge } from './validityBadge';

/**
 * What a viewer may see of a contract (FR-RBAC-06): fields a role may not
 * see are removed from the response, not merely hidden in the UI.
 *
 *   - Without `contracts.manage`, only the contract's validity: number,
 *     status, validity, start, end and company (Reception, FR-RBAC-21). `id`
 *     is the handle the page opens it by, not data about the contract.
 *   - Without `commercial.view`, no amount and none of the contract's other
 *     commercial fields: annual value, discount, package and services, terms,
 *     deal, offer, renewal date and signed document (FR-RBAC-21).
 *   - Without `payments.view`, no payment summary, payment rows or arrears.
 *
 * The CEO (read-only, but with commercial and payment data) therefore gets
 * validity plus the money, and Reception gets validity alone.
 */
const VALIDITY_FIELDS = ['id', 'number', 'status', 'startsAt', 'endsAt'] as const;

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

export function presentContract(contract: Contract, access: AccessContext, clock?: ValidityClock): ContractView {
  const full = contract.toJSON() as ContractView;
  const view: ContractView = access.can('contracts.manage') ? { ...full } : pick(full, VALIDITY_FIELDS);
  if (!access.can('contracts.manage')) view.company = { id: contract.clientId, name: contract.clientName };
  // The same badge the company search shows, from the same function (FR-CON-20, FR-CON-21).
  if (clock) view.validity = validityBadge([contract], clock.today, clock.expiringSoonDays);

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

export function presentContracts(contracts: Contract[], access: AccessContext, clock?: ValidityClock): ContractView[] {
  return contracts.map((contract) => presentContract(contract, access, clock));
}

/**
 * The contract page. Payment rows need `payments.view` — without it the
 * `payments` key is absent, not empty, so nothing named for payments reaches
 * the viewer. The status history is a manager's record.
 */
export function presentContractDetail<P, H>(
  detail: { contract: Contract; payments: P[]; history: H[]; documents: unknown[]; permittedActions: string[] },
  access: AccessContext,
  clock?: ValidityClock
) {
  const { payments, documents, ...rest } = detail;
  return {
    ...rest,
    contract: presentContract(detail.contract, access, clock),
    history: access.can('contracts.manage') ? detail.history : [],
    // The signed document is a commercial record (FR-CON-19, FR-RBAC-21).
    ...(access.can('commercial.view') ? { documents } : {}),
    ...(access.can('payments.view') ? { payments } : {}),
  };
}

/** The contracts tab on a company. What the client owes needs `payments.view`. */
export function presentClientContracts<S extends { outstanding: number; overdueCount: number }>(
  result: { contracts: Contract[]; summary: S },
  access: AccessContext,
  clock?: ValidityClock
) {
  const summary: Record<string, unknown> = { ...result.summary };
  if (!access.can('payments.view')) {
    delete summary.outstanding;
    delete summary.overdueCount;
  }
  // Which plan the client is on is a commercial fact (FR-CON-21).
  if (!access.can('commercial.view')) delete summary.activePlanName;
  // The company's one badge, from the same function the search uses (FR-CON-21, FR-CON-22).
  if (clock) summary.validity = validityBadge(result.contracts, clock.today, clock.expiringSoonDays);
  return { contracts: presentContracts(result.contracts, access, clock), summary };
}

function pick(source: ContractView, keys: readonly string[]): ContractView {
  const picked: ContractView = {};
  for (const key of keys) {
    if (key in source) picked[key] = source[key];
  }
  return picked;
}
