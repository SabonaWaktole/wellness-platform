import { addDays, addMonths, startOfDay } from '../../contracts/domain/calendarDay';
import type { Tier } from './Tier';

export type PaymentKind = 'NEW' | 'RENEWAL' | 'UPGRADE';

/** Start plus the term months, minus one day, the month clamped first (FR-TIR-03). */
export function termEndDate(start: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error('A membership term must be a whole number of months, at least 1');
  }
  return addDays(addMonths(start, months), -1);
}

export interface PaidTermInput {
  kind: PaymentKind;
  paymentDate: Date;
  /** End date of the member's current paid term, if any. */
  currentEnd: Date | null;
  months: number;
  graceDays: number;
}

export interface PaidTermDates {
  /** The kind that applies: a renewal outside the grace window is a New term. */
  kind: PaymentKind;
  startsOn: Date;
  endsOn: Date;
  /** An upgrade closes the earlier paid term the day before (FR-MPAY-04). */
  closesEarlierTermOn: Date | null;
}

export function paidTermDates({ kind, paymentDate, currentEnd, months, graceDays }: PaidTermInput): PaidTermDates {
  if (kind === 'RENEWAL') {
    const renewable = currentEnd !== null && startOfDay(paymentDate) <= startOfDay(addDays(currentEnd, graceDays));
    if (renewable) {
      const startsOn = addDays(currentEnd, 1);
      return { kind, startsOn, endsOn: termEndDate(startsOn, months), closesEarlierTermOn: null };
    }
    return { kind: 'NEW', startsOn: paymentDate, endsOn: termEndDate(paymentDate, months), closesEarlierTermOn: null };
  }

  return {
    kind,
    startsOn: paymentDate,
    endsOn: termEndDate(paymentDate, months),
    closesEarlierTermOn: kind === 'UPGRADE' && currentEnd !== null ? addDays(paymentDate, -1) : null,
  };
}

export interface DowngradeTerm {
  tier: Tier;
  startsOn: Date;
  endsOn: Date;
}

/**
 * The term that follows an ended Gold term (FR-TIR-06, D4): Silver from the day
 * after end plus grace days, for the Silver term length. Silver steps down to
 * Bronze, which has no term, so there is nothing to create.
 */
export function downgradeTerm(ended: { tier: Tier; endsOn: Date }, graceDays: number, silverMonths: number): DowngradeTerm | null {
  if (ended.tier !== 'GOLD') return null;
  const startsOn = addDays(ended.endsOn, graceDays + 1);
  return { tier: 'SILVER', startsOn, endsOn: termEndDate(startsOn, silverMonths) };
}

export interface VipTerm {
  startsOn: Date;
  endsOn: Date;
  reviewDate: Date;
}

/**
 * FR-VIP-03, FR-VIP-04: from the approval date, or the day after the current
 * VIP term when approved before it ends. The review date is the end date.
 */
export function vipTerm(approvalDate: Date, months: number, currentVipEnd: Date | null): VipTerm {
  const extends_ = currentVipEnd !== null && startOfDay(approvalDate) <= startOfDay(currentVipEnd);
  const startsOn = extends_ ? addDays(currentVipEnd, 1) : approvalDate;
  const endsOn = termEndDate(startsOn, months);
  return { startsOn, endsOn, reviewDate: endsOn };
}
