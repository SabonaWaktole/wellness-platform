import { BillingPeriod, MONTHS_PER_PERIOD } from './Contract';

export interface ScheduledInstalment {
  periodIndex: number;
  dueDate: Date;
  amount: number;
}

/**
 * Adds whole months to a date, clamping the day rather than rolling over.
 *
 * `new Date(2026, 0, 31)` plus one month is 3 March in plain JS arithmetic,
 * because February has no 31st and the Date constructor silently overflows.
 * For a billing schedule that is not a curiosity: a contract starting on the
 * 31st would produce due dates wandering forward through the year. Clamping to
 * the last day of the target month is what every real billing system does.
 */
const addMonths = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, lastDayOfTarget),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
};

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
