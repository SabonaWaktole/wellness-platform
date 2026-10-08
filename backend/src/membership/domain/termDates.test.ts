import { downgradeTerm, paidTermDates, termEndDate, vipTerm } from './termDates';
import { day, iso } from './testSupport';

describe('termEndDate', () => {
  it.each([
    ['FR-TIR-03: 15.03.2027 for 12 months ends 14.03.2028', '2027-03-15', 12, '2028-03-14'],
    ['FR-TIR-03: 15.03.2028 for 12 months ends 14.03.2029', '2028-03-15', 12, '2029-03-14'],
    ['FR-TIR-03: a 29 February start clamps the month', '2028-02-29', 12, '2029-02-27'],
    ['FR-TIR-03: a 31 January start clamps the month', '2027-01-31', 1, '2027-02-27'],
    ['FR-TIR-03: a 1 January start ends on 31 December', '2028-01-01', 12, '2028-12-31'],
  ])('%s', (_t, start, months, expected) => {
    expect(iso(termEndDate(day(start), months))).toBe(expected);
  });
});

describe('paidTermDates', () => {
  it('FR-TIR-03: a new purchase starts on the payment date', () => {
    const r = paidTermDates({ kind: 'NEW', paymentDate: day('2027-03-15'), currentEnd: null, months: 12, graceDays: 0 });
    expect([r.kind, iso(r.startsOn), iso(r.endsOn), r.closesEarlierTermOn]).toEqual(['NEW', '2027-03-15', '2028-03-14', null]);
  });

  it('FR-TIR-03: a renewal paid 01.03.2028 runs 15.03.2028 to 14.03.2029', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-03-01'), currentEnd: day('2028-03-14'), months: 12, graceDays: 0 });
    expect([r.kind, iso(r.startsOn), iso(r.endsOn)]).toEqual(['RENEWAL', '2028-03-15', '2029-03-14']);
  });

  it('FR-TIR-04: renewing 20 days early loses no days', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-02-23'), currentEnd: day('2028-03-14'), months: 12, graceDays: 0 });
    expect(iso(r.startsOn)).toBe('2028-03-15');
  });

  it('FR-TIR-04: paying 3 months after the end is a New term starting that day', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-06-14'), currentEnd: day('2028-03-14'), months: 12, graceDays: 0 });
    expect([r.kind, iso(r.startsOn), iso(r.endsOn)]).toEqual(['NEW', '2028-06-14', '2029-06-13']);
  });

  it('FR-TIR-04, FR-TIR-05: with 14 grace days a payment 10 days after the end is still a renewal, with no gap', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-03-24'), currentEnd: day('2028-03-14'), months: 12, graceDays: 14 });
    expect([r.kind, iso(r.startsOn)]).toEqual(['RENEWAL', '2028-03-15']);
  });

  it('FR-TIR-04, FR-TIR-05: the day after the grace window is a New purchase', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-03-29'), currentEnd: day('2028-03-14'), months: 12, graceDays: 14 });
    expect(r.kind).toBe('NEW');
  });

  it('FR-TIR-04: a renewal with no paid term to follow is a New term', () => {
    const r = paidTermDates({ kind: 'RENEWAL', paymentDate: day('2028-03-01'), currentEnd: null, months: 12, graceDays: 0 });
    expect(r.kind).toBe('NEW');
  });

  it('FR-MPAY-04: Silver paid 15.03.2027 and upgraded 15.09.2027 ends 14.09.2027, Gold runs 15.09.2027 to 14.09.2028', () => {
    const r = paidTermDates({ kind: 'UPGRADE', paymentDate: day('2027-09-15'), currentEnd: day('2028-03-14'), months: 12, graceDays: 0 });
    expect([r.kind, iso(r.startsOn), iso(r.endsOn), iso(r.closesEarlierTermOn!)]).toEqual(['UPGRADE', '2027-09-15', '2028-09-14', '2027-09-14']);
  });

  it('FR-MPAY-04: upgrading a sponsored term leaves it alone (no paid term to close)', () => {
    const r = paidTermDates({ kind: 'UPGRADE', paymentDate: day('2027-09-15'), currentEnd: null, months: 12, graceDays: 0 });
    expect(r.closesEarlierTermOn).toBeNull();
  });

  it('FR-TIR-03: refuses a term of less than one month', () => {
    expect(() => paidTermDates({ kind: 'NEW', paymentDate: day('2027-03-15'), currentEnd: null, months: 0, graceDays: 0 })).toThrow();
  });
});

describe('downgradeTerm', () => {
  it('FR-TIR-06: Gold ending 31.12.2027 gives Silver 01.01.2028 to 31.12.2028', () => {
    const t = downgradeTerm({ tier: 'GOLD', endsOn: day('2027-12-31') }, 0, 12)!;
    expect([t.tier, iso(t.startsOn), iso(t.endsOn)]).toEqual(['SILVER', '2028-01-01', '2028-12-31']);
  });

  it('FR-TIR-05: with 14 grace days the Silver term starts 15.01', () => {
    const t = downgradeTerm({ tier: 'GOLD', endsOn: day('2027-12-31') }, 14, 12)!;
    expect(iso(t.startsOn)).toBe('2028-01-15');
  });

  it('FR-TIR-06: Silver steps down to Bronze, which needs no term', () => {
    expect(downgradeTerm({ tier: 'SILVER', endsOn: day('2028-12-31') }, 0, 12)).toBeNull();
  });

  it('FR-TIR-06: Bronze and VIP are not downgraded by this rule', () => {
    expect(downgradeTerm({ tier: 'BRONZE', endsOn: day('2028-12-31') }, 0, 12)).toBeNull();
    expect(downgradeTerm({ tier: 'VIP', endsOn: day('2028-12-31') }, 0, 12)).toBeNull();
  });
});

describe('vipTerm', () => {
  it('FR-VIP-03: approved 10.04.2027 runs until 09.04.2028 and the review date is the end date', () => {
    const t = vipTerm(day('2027-04-10'), 12, null);
    expect([iso(t.startsOn), iso(t.endsOn), iso(t.reviewDate)]).toEqual(['2027-04-10', '2028-04-09', '2028-04-09']);
  });

  it('FR-VIP-04: a new approval before the end extends VIP from the next day', () => {
    const t = vipTerm(day('2028-03-01'), 12, day('2028-04-09'));
    expect([iso(t.startsOn), iso(t.endsOn)]).toEqual(['2028-04-10', '2029-04-09']);
  });

  it('FR-VIP-04: an approval after the VIP term ended starts on the approval date', () => {
    const t = vipTerm(day('2028-06-01'), 12, day('2028-04-09'));
    expect(iso(t.startsOn)).toBe('2028-06-01');
  });
});
