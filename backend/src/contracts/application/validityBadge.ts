import { ContractInvalidReason, ContractStatus, contractValidityOn } from '../domain/Contract';
import { startOfDay } from '../domain/calendarDay';

/** The badge reads `NO_CONTRACT` when a company has never had a contract. */
export type ValidityBadgeReason = ContractInvalidReason | 'NO_CONTRACT';

export interface ValidityBadge {
  status: 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID';
  reason: ValidityBadgeReason | null;
  /** Calendar days, `YYYY-MM-DD`; null when there is no contract. */
  startsOn: string | null;
  endsOn: string | null;
  daysLeft: number | null;
}

export interface BadgeContract {
  status: ContractStatus;
  startsAt: Date;
  endsAt: Date;
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The one badge a company shows (FR-CON-21, FR-CON-22): the contract valid
 * today (the one ending last if several), otherwise the latest contract (the
 * latest start, then the latest end). The verdict is `Contract.validityOn`
 * and nothing else (FR-CON-20); this only chooses which contract speaks.
 */
export function validityBadge(contracts: readonly BadgeContract[], today: Date, expiringSoonDays: number): ValidityBadge {
  if (contracts.length === 0) {
    return { status: 'NOT_VALID', reason: 'NO_CONTRACT', startsOn: null, endsOn: null, daysLeft: null };
  }

  const judged = contracts.map((contract) => ({ contract, validity: contractValidityOn(contract, today, expiringSoonDays) }));
  const byEnd = (a: BadgeContract, b: BadgeContract) => startOfDay(b.endsAt) - startOfDay(a.endsAt);
  const byLatest = (a: BadgeContract, b: BadgeContract) => startOfDay(b.startsAt) - startOfDay(a.startsAt) || byEnd(a, b);

  const valid = judged.filter((entry) => entry.validity.valid).sort((a, b) => byEnd(a.contract, b.contract));
  const chosen = valid[0] ?? [...judged].sort((a, b) => byLatest(a.contract, b.contract))[0];
  const { contract, validity } = chosen;

  return {
    status: validity.valid ? (validity.expiringSoon ? 'EXPIRING_SOON' : 'VALID') : 'NOT_VALID',
    reason: validity.reason,
    startsOn: dayKey(contract.startsAt),
    endsOn: dayKey(contract.endsAt),
    daysLeft: validity.daysLeft,
  };
}
