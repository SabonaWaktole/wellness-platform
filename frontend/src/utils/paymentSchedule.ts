import type { BillingPeriod } from '../types/contract';

/**
 * Preview of the instalments a contract term will generate.
 *
 * A deliberate mirror of the backend's `buildPaymentSchedule`, not a second
 * opinion: the server remains the only thing that WRITES payment rows, and
 * this exists purely so the form can say "12 payments of 100 will be
 * scheduled" before anyone commits. Kept byte-comparable in behaviour, with
 * the same month-clamping and the same cap, so the preview can never promise
 * a schedule the server would not produce.
 *
 * If the two ever need to diverge, the fix is to have the server return the
 * preview — not to let this drift.
 */

export interface ScheduledInstalment {
  periodIndex: number;
  dueDate: Date;
  amount: number;
}

const MONTHS_PER_PERIOD: Record<BillingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
  ONE_TIME: 0,
};

export const MAX_INSTALMENTS = 120;

/** Adds whole months, clamping the day rather than overflowing into next month. */
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

export function buildPaymentSchedule(input: {
  billingPeriod: BillingPeriod;
  amount: number;
  startsAt: Date;
  endsAt: Date;
}): ScheduledInstalment[] {
  const { billingPeriod, amount, startsAt, endsAt } = input;

  if (billingPeriod === 'ONE_TIME') {
    return [{ periodIndex: 1, dueDate: startsAt, amount }];
  }

  const step = MONTHS_PER_PERIOD[billingPeriod];
  const instalments: ScheduledInstalment[] = [];

  for (let index = 0; index < MAX_INSTALMENTS; index += 1) {
    const dueDate = addMonths(startsAt, step * index);
    if (dueDate.getTime() > endsAt.getTime()) break;
    instalments.push({ periodIndex: index + 1, dueDate, amount });
  }

  if (instalments.length === 0) {
    return [{ periodIndex: 1, dueDate: startsAt, amount }];
  }

  return instalments;
}
