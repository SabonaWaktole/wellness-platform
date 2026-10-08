import { addDays, startOfDay } from '../../contracts/domain/calendarDay';

export interface ContractSpan {
  startsOn: Date;
  endsOn: Date;
}

/**
 * The displayed expiry of a sponsored term (FR-EMP-09, D8): the end of the
 * contract chain valid today. Starting from a contract valid today, the end is
 * extended through any contract that starts on or before the day after it
 * ends, repeatedly. A gap of a day or more stops the chain. Null when no
 * contract is valid today.
 */
export function sponsorEndDate(contracts: readonly ContractSpan[], today: Date): Date | null {
  const day = startOfDay(today);
  const valid = contracts.filter((c) => startOfDay(c.startsOn) <= day && day <= startOfDay(c.endsOn));
  if (valid.length === 0) return null;

  let end = valid.reduce((latest, c) => (startOfDay(c.endsOn) > startOfDay(latest) ? c.endsOn : latest), valid[0].endsOn);
  for (let extended = true; extended; ) {
    extended = false;
    const nextDay = startOfDay(addDays(end, 1));
    for (const c of contracts) {
      if (startOfDay(c.startsOn) <= nextDay && startOfDay(c.endsOn) > startOfDay(end)) {
        end = c.endsOn;
        extended = true;
      }
    }
  }
  return end;
}
