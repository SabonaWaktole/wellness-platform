import { Money } from '../../pricing/domain/Money';
import { BillingPeriod, MONTHS_PER_PERIOD } from './Contract';
import { addMonths } from './calendarDay';
import { defaultEndDate } from './contractTerm';

export interface PricedInstalment {
  periodIndex: number;
  dueDate: Date;
  amount: Money;
}

/** Bound on generated rows, so a mistyped end date cannot create 40,000 of them. */
export const MAX_INSTALMENTS = 120;

/** Smallest number of whole months whose term (start .. +m months - 1 day) reaches `end`. */
const termMonthsBetween = (start: Date, end: Date, fromExclusive: number, toInclusive: number): number => {
  for (let months = fromExclusive + 1; months < toInclusive; months += 1) {
    if (defaultEndDate(start, months).getTime() >= end.getTime()) return months;
  }
  return toInclusive;
};

/**
 * The instalments a term produces, priced on `Money` (FR-PAY-02, D5).
 *
 * Dates follow the same rules as `buildPaymentSchedule`: the first on the
 * start date, then the same day of each following period measured from the
 * start (so a 31st clamps without drifting), none after the end date, at most
 * `MAX_INSTALMENTS`.
 *
 * Each instalment is the agreed MONTHLY price times the months it covers:
 * quarterly is 3 x monthly, annual 12 x, one-time the whole term. The last
 * instalment covers whatever is left of the term, so the amounts add up to
 * monthly price x term months for every billing period (a 13-month quarterly
 * term ends with a one-month instalment). Months are whole and the price is
 * two decimals, so every amount is exact and no cent is ever left to round.
 *
 * Only if the 120-row cap cuts the schedule short does the total fall below
 * the term value; the schedule then covers 120 periods and no more.
 */
export function buildInstalmentSchedule(input: {
  billingPeriod: BillingPeriod;
  monthlyPrice: Money;
  startsAt: Date;
  endsAt: Date;
}): PricedInstalment[] {
  const { billingPeriod, monthlyPrice, startsAt, endsAt } = input;

  if (endsAt.getTime() < startsAt.getTime()) {
    throw new Error('A contract cannot end before it starts');
  }

  const step = billingPeriod === BillingPeriod.OneTime ? 0 : MONTHS_PER_PERIOD[billingPeriod];

  const dueDates: Date[] = [];
  let capped = false;
  if (step === 0) {
    dueDates.push(startsAt);
  } else {
    for (let index = 0; ; index += 1) {
      if (index === MAX_INSTALMENTS) {
        capped = true;
        break;
      }
      const dueDate = addMonths(startsAt, step * index);
      if (dueDate.getTime() > endsAt.getTime()) break;
      dueDates.push(dueDate);
    }
  }

  // Months the whole term spans. Unknown (and not needed) for a capped schedule.
  const lastStart = step * (dueDates.length - 1);
  const termMonths = capped
    ? step * dueDates.length
    : step === 0
      ? termMonthsBetween(startsAt, endsAt, 0, Number.MAX_SAFE_INTEGER)
      : termMonthsBetween(startsAt, endsAt, lastStart, step * dueDates.length);

  return dueDates.map((dueDate, index) => {
    const isLast = index === dueDates.length - 1;
    const months = step === 0 ? termMonths : isLast ? termMonths - step * index : step;
    return { periodIndex: index + 1, dueDate, amount: monthlyPrice.multiplyBy(months) };
  });
}
