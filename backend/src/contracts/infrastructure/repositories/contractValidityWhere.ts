import { ContractStatus } from '../../domain/Contract';
import { addDays } from '../../domain/calendarDay';

/** The validity filter values of the contract list (FR-CON-08). */
export type ContractValidityFilter = 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID';

const VALID_FILTERS: readonly ContractValidityFilter[] = ['VALID', 'EXPIRING_SOON', 'NOT_VALID'];

export const isValidityFilter = (value: string): value is ContractValidityFilter =>
  VALID_FILTERS.includes(value as ContractValidityFilter);

/**
 * The database-neutral predicate for `Contract.validityOn` (FR-CON-20): Active,
 * started on or before `today`, ending on or after it. `today` is the
 * workspace day as a UTC-midnight date. The dates are compared as whole days,
 * as the domain function does: a start is reached before midnight of the next
 * day, and an end is not yet past from its own midnight.
 *
 * Tested against the domain function over a table of contracts, so the SQL and
 * the rule cannot drift apart. Only plain comparisons, so it is the same on
 * PostgreSQL and MySQL.
 */
export function validityWhere(
  filter: ContractValidityFilter,
  today: Date,
  expiringSoonDays: number
): Record<string, unknown> {
  const valid = {
    status: ContractStatus.Active,
    startsAt: { lt: addDays(today, 1) },
    endsAt: { gte: today },
  };

  switch (filter) {
    case 'VALID':
      return valid;
    case 'EXPIRING_SOON':
      // daysLeft <= window, so the end is no later than the end of day `today + window`.
      return { ...valid, endsAt: { gte: today, lt: addDays(today, expiringSoonDays + 1) } };
    case 'NOT_VALID':
      return { NOT: valid };
  }
}
