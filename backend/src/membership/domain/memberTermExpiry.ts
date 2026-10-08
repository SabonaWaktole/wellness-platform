import { addDays, startOfDay } from '../../contracts/domain/calendarDay';
import { effectiveTierOn, type MemberTermValue } from './MemberTerm';
import { downgradeTerm } from './termDates';
import type { Tier } from './Tier';
import { tierRank } from './Tier';

/** A term as the daily job sees it: the keys that tell whether a term was already followed (D3). */
export interface JobTerm extends MemberTermValue {
  id: string;
  followsTermId: string | null;
}

export interface PlannedDowngrade {
  /** The ended term this one follows; unique in the database, so a second run cannot add another (D3). */
  followsTermId: string;
  tier: Tier;
  startsOn: Date;
  endsOn: Date;
}

/**
 * FR-TIR-05, FR-TIR-06, D4: a paid Gold term whose end date plus the grace days
 * is before today, and that nothing follows, is followed by a Silver term from
 * the day after, for the Silver term length. Silver steps down to Bronze, which
 * has no term, so a paid Silver term plans nothing.
 *
 * Selecting by state against `today` (never "yesterday") is what makes a run
 * after a gap catch up. A term is "followed" when a downgrade already points at
 * it, or when a paid or downgrade term starts after it began and no later than
 * the day after its last valid day (the member renewed or bought in time). The
 * downgrade is a Silver term, which itself plans nothing, so one pass is stable.
 */
export function planDowngrades(terms: readonly JobTerm[], graceDays: number, silverMonths: number, today: Date): PlannedDowngrade[] {
  const planned: PlannedDowngrade[] = [];
  for (const term of terms) {
    if (term.source !== 'PAID' || term.tier !== 'GOLD' || term.endsOn === null) continue;
    const lastValid = addDays(term.endsOn, graceDays);
    if (!(startOfDay(lastValid) < startOfDay(today))) continue;
    if (terms.some((other) => other.followsTermId === term.id)) continue;
    const latestStart = addDays(lastValid, 1);
    const replaced = terms.some(
      (other) =>
        other.id !== term.id &&
        (other.source === 'PAID' || other.source === 'DOWNGRADE') &&
        startOfDay(other.startsOn) > startOfDay(term.startsOn) &&
        startOfDay(other.startsOn) <= startOfDay(latestStart)
    );
    if (replaced) continue;
    const next = downgradeTerm({ tier: term.tier, endsOn: term.endsOn }, graceDays, silverMonths);
    if (next) planned.push({ followsTermId: term.id, ...next });
  }
  return planned;
}

export type StepDownReason = 'Not renewed' | 'VIP ended' | 'Correction ended' | 'Term ended' | 'Term started';

export interface TierTransition {
  on: Date;
  from: Tier;
  to: Tier;
  reason: StepDownReason;
}

/** The first day a term no longer counts: the day after its last valid day (FR-TIR-02). */
const firstDayNotValid = (term: MemberTermValue, graceDays: number): Date | null => {
  if (term.endsOn === null) return null;
  const counts = term.source === 'PAID' || term.source === 'DOWNGRADE';
  return addDays(counts ? addDays(term.endsOn, graceDays) : term.endsOn, 1);
};

/**
 * Every change of effective tier after `after` and up to `today`, one per day it
 * happens, each with its true date: after a long gap the member steps down twice
 * in one run and the history shows both dates (D4, FR-TIR-08). Starting from the
 * tier recorded at `after` and walking the days on which a term begins or stops
 * counting, it reuses the one tier rule, so the history can never disagree with
 * the member page. Nothing is returned for a day already past `after` that left
 * the tier alone, which is what makes a second run add no row.
 */
export function tierTransitions(input: {
  terms: readonly MemberTermValue[];
  sponsorValid: boolean;
  graceDays: number;
  startingTier: Tier;
  after: Date;
  today: Date;
}): TierTransition[] {
  const { terms, sponsorValid, graceDays, after, today } = input;
  const days = new Set<number>();
  const consider = (date: Date | null) => {
    if (date === null) return;
    const d = startOfDay(date);
    if (d > startOfDay(after) && d <= startOfDay(today)) days.add(d);
  };
  for (const term of terms) {
    consider(term.startsOn);
    consider(firstDayNotValid(term, graceDays));
  }

  const result: TierTransition[] = [];
  let running = input.startingTier;
  for (const stamp of [...days].sort((a, b) => a - b)) {
    const on = new Date(stamp);
    const tier = effectiveTierOn(terms, sponsorValid, graceDays, on);
    if (tier === running) continue;
    const ended = terms.filter((t) => {
      const first = firstDayNotValid(t, graceDays);
      return first !== null && startOfDay(first) === stamp;
    });
    const reason: StepDownReason =
      tierRank(tier) > tierRank(running)
        ? 'Term started'
        : ended.some((t) => t.source === 'VIP')
          ? 'VIP ended'
          : ended.some((t) => t.source === 'PAID' || t.source === 'DOWNGRADE')
            ? 'Not renewed'
            : ended.some((t) => t.source === 'CORRECTION')
              ? 'Correction ended'
              : 'Term ended';
    result.push({ on, from: running, to: tier, reason });
    running = tier;
  }
  return result;
}
