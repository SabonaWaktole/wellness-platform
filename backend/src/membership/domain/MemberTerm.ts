import { addDays, startOfDay } from '../../contracts/domain/calendarDay';
import { type Tier, tierRank } from './Tier';

export type TermSource = 'PAID' | 'SPONSORED' | 'VIP' | 'DOWNGRADE' | 'CORRECTION';

export interface MemberTermValue {
  tier: Tier;
  source: TermSource;
  startsOn: Date;
  /** Null for a sponsored term: it follows the employer contract (D3). */
  endsOn: Date | null;
}

/**
 * Paid and downgrade terms count through the grace days (FR-TIR-05). A VIP or
 * correction term has an explicit end date and counts to that date only.
 */
const countsGrace = (source: TermSource): boolean => source === 'PAID' || source === 'DOWNGRADE';

const isValidOn = (term: MemberTermValue, sponsorValid: boolean, graceDays: number, date: Date): boolean => {
  if (term.source === 'SPONSORED' && !sponsorValid) return false;
  const today = startOfDay(date);
  if (startOfDay(term.startsOn) > today) return false;
  if (term.endsOn === null) return true;
  const lastDay = countsGrace(term.source) ? addDays(term.endsOn, graceDays) : term.endsOn;
  return today <= startOfDay(lastDay);
};

export const validTermsOn = (
  terms: readonly MemberTermValue[],
  sponsorValid: boolean,
  graceDays: number,
  date: Date
): MemberTermValue[] => terms.filter((t) => isValidOn(t, sponsorValid, graceDays, date));

/**
 * The one effective-tier rule (FR-TIR-02, D2): the highest tier among the terms
 * valid on the date, Bronze as the floor.
 */
export const effectiveTierOn = (
  terms: readonly MemberTermValue[],
  sponsorValid: boolean,
  graceDays: number,
  date: Date
): Tier =>
  validTermsOn(terms, sponsorValid, graceDays, date).reduce<Tier>(
    (best, t) => (tierRank(t.tier) > tierRank(best) ? t.tier : best),
    'BRONZE'
  );
