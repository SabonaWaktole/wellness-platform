import { Money } from '../../pricing/domain/Money';
import { BillingPeriod, MONTHS_PER_PERIOD } from './Contract';
import { addMonths } from './calendarDay';
import { defaultEndDate } from './contractTerm';

export interface ScheduledInstalment {
  periodIndex: number;
  dueDate: Date;
  amount: number;
}

export interface PricedInstalment {
  periodIndex: number;
  dueDate: Date;
  amount: Money;
}

/** Bound on generated rows, so a mistyped end date cannot create 40,000 of them. */
export const MAX_INSTALMENTS = 120;

/**
 * The instalments a contract term is expected to produce.
 *
 * Due dates land on the ANNIVERSARY of the start date — the 1st instalment on
 * the start date itself, the next one period later — rather than at the end of
 * each period. That matches how a subscription is actually sold ("you pay on
 * the 5th of each month"), and it means the first payment is due the day the
 * contract begins rather than a month after the customer already had service.
 *
 * Generation stops at the term's end: a period starting after `endsAt` is not
 * covered by this term, it belongs to the renewal. So a 1 Jan – 31 Dec monthly
 * contract yields exactly 12 rows, and a 1 Jan – 15 Dec one yields 12 as well
 * (the 1 Dec instalment starts inside the term), not 11.
 */
/**
 * @deprecated Float amounts, one flat amount per row. Kept only for
 * `ActivateContractUseCase` until Slice 5 moves activation onto
 * `buildInstalmentSchedule`; do not add callers.
 */
export function buildPaymentSchedule(input: {
  billingPeriod: BillingPeriod;
  amount: number;
  startsAt: Date;
  endsAt: Date;
}): ScheduledInstalment[] {
  const { billingPeriod, amount, startsAt, endsAt } = input;

  // ONE_TIME is the whole term in a single row, due on day one. It has no
  // month count to step by, so it cannot go through the loop below.
  if (billingPeriod === BillingPeriod.OneTime) {
    return [{ periodIndex: 1, dueDate: startsAt, amount }];
  }

  const step = MONTHS_PER_PERIOD[billingPeriod];
  const instalments: ScheduledInstalment[] = [];

  for (let index = 0; index < MAX_INSTALMENTS; index += 1) {
    const dueDate = addMonths(startsAt, step * index);
    // `>` not `>=`: a term ending exactly on an instalment date still owes
    // that instalment — the last day is covered by the term, not excluded
    // from it.
    if (dueDate.getTime() > endsAt.getTime()) break;
    instalments.push({ periodIndex: index + 1, dueDate, amount });
  }

  // A term shorter than one period still owes one payment. Falling through
  // with an empty schedule would present a paid-for contract as having nothing
  // to collect, which is the worst possible failure mode for this module.
  if (instalments.length === 0) {
    return [{ periodIndex: 1, dueDate: startsAt, amount }];
  }

  return instalments;
}

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
