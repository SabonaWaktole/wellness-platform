import { planRenewalReminder } from './renewalReminders';
import { renewalStateOf } from './renewalState';

describe('planRenewalReminder (M3 D8)', () => {
  const lead = [60, 30, 7];

  it.each([
    // FR-REN-03: first sight with 25 days left sends the 30-day reminder and skips the 60-day one.
    { daysLeft: 25, recorded: [], send: 30, skip: [60] },
    { daysLeft: 60, recorded: [], send: 60, skip: [] },
    { daysLeft: 61, recorded: [], send: null, skip: [] },
    { daysLeft: 45, recorded: [60], send: null, skip: [] },
    { daysLeft: 29, recorded: [60], send: 30, skip: [] },
    // Recorded lead times are not repeated, even once the contract has moved on.
    { daysLeft: 6, recorded: [60, 30], send: 7, skip: [] },
    { daysLeft: 6, recorded: [60, 30, 7], send: null, skip: [] },
    // A two-day gap over the 30-day point: only the 7-day reminder is still useful.
    { daysLeft: 5, recorded: [60], send: 7, skip: [30] },
    // The last day, and an end date that is today.
    { daysLeft: 0, recorded: [], send: 7, skip: [60, 30] },
  ])('daysLeft $daysLeft, recorded $recorded -> send $send, skip $skip', ({ daysLeft, recorded, send, skip }) => {
    expect(planRenewalReminder({ leadDays: lead, daysLeft, recorded })).toEqual({ send, skip });
  });

  it('FR-REN-01: a changed list of 90 and 30 reminds at 90 and at 30', () => {
    expect(planRenewalReminder({ leadDays: [90, 30], daysLeft: 88, recorded: [] })).toEqual({ send: 90, skip: [] });
    expect(planRenewalReminder({ leadDays: [90, 30], daysLeft: 28, recorded: [90] })).toEqual({ send: 30, skip: [] });
    // Past 90 already when the list changed: recorded as skipped, not reminded twice.
    expect(planRenewalReminder({ leadDays: [90, 30], daysLeft: 28, recorded: [] })).toEqual({ send: 30, skip: [90] });
  });

  it('ignores a duplicated lead time', () => {
    expect(planRenewalReminder({ leadDays: [30, 30], daysLeft: 10, recorded: [] })).toEqual({ send: 30, skip: [] });
  });
});

describe('renewalStateOf (M3 D9, FR-REN-05)', () => {
  it.each([
    [{ notRenewing: true, renewed: true, openDeal: true }, 'NOT_RENEWING'],
    [{ notRenewing: false, renewed: true, openDeal: true }, 'RENEWED'],
    [{ notRenewing: false, renewed: false, openDeal: true }, 'IN_NEGOTIATION'],
    [{ notRenewing: false, renewed: false, openDeal: false }, 'NOT_STARTED'],
  ])('%j -> %s', (facts, state) => {
    expect(renewalStateOf(facts)).toBe(state);
  });
});
