import { BillingPeriod } from './Contract';
import { buildPaymentSchedule } from './paymentSchedule';

describe('buildPaymentSchedule', () => {
  it('produces twelve instalments for a monthly one-year term', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Monthly,
      amount: 100,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });

    expect(schedule).toHaveLength(12);
    expect(schedule[0].dueDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(schedule[11].dueDate.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(schedule.every((i) => i.amount === 100)).toBe(true);
  });

  it('numbers instalments from one', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Quarterly,
      amount: 300,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });

    expect(schedule.map((i) => i.periodIndex)).toEqual([1, 2, 3, 4]);
  });

  it('clamps the day rather than overflowing into the next month', () => {
    // Plain `setMonth` arithmetic turns 31 January + 1 month into 3 March,
    // and every later due date inherits the drift.
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Monthly,
      amount: 50,
      startsAt: new Date('2026-01-31T00:00:00Z'),
      endsAt: new Date('2026-04-30T00:00:00Z'),
    });

    expect(schedule.map((i) => i.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('gives a one-time contract exactly one instalment, due on day one', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.OneTime,
      amount: 1200,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(1200);
    expect(schedule[0].dueDate.toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('includes an instalment falling exactly on the end date', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Annual,
      amount: 1000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2027-01-01T00:00:00Z'),
    });

    expect(schedule).toHaveLength(2);
  });

  it('still owes one payment for a term shorter than a single period', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Annual,
      amount: 1000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-03-01T00:00:00Z'),
    });

    expect(schedule).toHaveLength(1);
  });

  it('caps runaway schedules rather than generating unbounded rows', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: BillingPeriod.Monthly,
      amount: 10,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2226-01-01T00:00:00Z'),
    });

    expect(schedule).toHaveLength(120);
  });
});
