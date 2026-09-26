import { describe, it, expect } from 'vitest';
import { buildPaymentSchedule } from './paymentSchedule';

/**
 * These cases are deliberately the same ones the backend's
 * paymentSchedule.test.ts asserts. The preview exists only to describe what
 * the server will do, so the day the two disagree is the day the form starts
 * lying — and this is what catches it.
 */
describe('buildPaymentSchedule (preview)', () => {
  it('produces twelve instalments for a monthly one-year term', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: 'MONTHLY',
      amount: 100,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });

    expect(schedule).toHaveLength(12);
    expect(schedule[0].periodIndex).toBe(1);
  });

  it('clamps the day rather than overflowing into the next month', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: 'MONTHLY',
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

  it('gives a one-off contract a single instalment', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: 'ONE_TIME',
      amount: 1200,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].amount).toBe(1200);
  });

  it('still owes one payment for a term shorter than a single period', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: 'ANNUAL',
      amount: 1000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-03-01T00:00:00Z'),
    });

    expect(schedule).toHaveLength(1);
  });

  it('caps runaway schedules', () => {
    const schedule = buildPaymentSchedule({
      billingPeriod: 'MONTHLY',
      amount: 10,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2226-01-01T00:00:00Z'),
    });

    expect(schedule).toHaveLength(120);
  });
});
