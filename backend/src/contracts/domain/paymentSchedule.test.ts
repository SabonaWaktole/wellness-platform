import { Money } from '../../pricing/domain/Money';
import { buildInstalmentSchedule } from './paymentSchedule';
import { BillingPeriod } from './Contract';
import { defaultEndDate } from './contractTerm';

describe('buildInstalmentSchedule', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const price = Money.of('49.40');
  const start = day('2027-03-01');
  const end = day('2028-02-29');
  const build = (billingPeriod: BillingPeriod, overrides: { startsAt?: Date; endsAt?: Date } = {}) =>
    buildInstalmentSchedule({ billingPeriod, monthlyPrice: price, startsAt: start, endsAt: end, ...overrides });
  const total = (rows: ReturnType<typeof build>) => rows.reduce((sum, r) => sum.add(r.amount), Money.zero());

  it('FR-PAY-02: a monthly term from 1 March 2027 is 12 instalments of €49.40 on the 1st', () => {
    const rows = build(BillingPeriod.Monthly);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.amount.toString() === '49.40')).toBe(true);
    expect(rows.map((r) => iso(r.dueDate))).toEqual([
      '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01', '2027-07-01', '2027-08-01',
      '2027-09-01', '2027-10-01', '2027-11-01', '2027-12-01', '2028-01-01', '2028-02-01',
    ]);
    expect(rows.map((r) => r.periodIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('FR-PAY-02: a quarterly term is 4 instalments of €148.20', () => {
    const rows = build(BillingPeriod.Quarterly);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.amount.toString() === '148.20')).toBe(true);
    expect(rows.map((r) => iso(r.dueDate))).toEqual(['2027-03-01', '2027-06-01', '2027-09-01', '2027-12-01']);
  });

  it('FR-PAY-02: an annual term is one instalment of 12 x monthly; one-time is the whole term', () => {
    expect(build(BillingPeriod.Annual).map((r) => r.amount.toString())).toEqual(['592.80']);
    const oneTime = build(BillingPeriod.OneTime);
    expect(oneTime).toHaveLength(1);
    expect(oneTime[0].amount.toString()).toBe('592.80');
    expect(iso(oneTime[0].dueDate)).toBe('2027-03-01');
  });

  it('FR-PAY-02: a 31 January start has its second instalment on 28 February, and does not drift', () => {
    const startsAt = day('2027-01-31');
    const rows = build(BillingPeriod.Monthly, { startsAt, endsAt: defaultEndDate(startsAt, 4) });
    expect(rows.map((r) => iso(r.dueDate))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('FR-PAY-02: no instalment starts after the end date, and one on the end date is kept', () => {
    const rows = build(BillingPeriod.Monthly, { startsAt: day('2027-01-01'), endsAt: day('2027-03-01') });
    expect(rows.map((r) => iso(r.dueDate))).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
  });

  it('FR-PAY-02: at most 120 instalments', () => {
    const rows = build(BillingPeriod.Monthly, { endsAt: day('2227-01-01') });
    expect(rows).toHaveLength(120);
    expect(total(rows).toString()).toBe('5928.00');
  });

  it('FR-PAY-02: a term shorter than the period still owes one instalment, for the months it has', () => {
    const rows = build(BillingPeriod.Annual, { endsAt: defaultEndDate(start, 2) });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount.toString()).toBe('98.80');
  });

  it('FR-PAY-02: refuses a term that ends before it starts', () => {
    expect(() => build(BillingPeriod.Monthly, { endsAt: day('2027-02-28') })).toThrow();
  });

  it.each([
    [BillingPeriod.Monthly, 12],
    [BillingPeriod.Monthly, 13],
    [BillingPeriod.Quarterly, 12],
    [BillingPeriod.Quarterly, 13],
    [BillingPeriod.Quarterly, 14],
    [BillingPeriod.Quarterly, 7],
    [BillingPeriod.Annual, 12],
    [BillingPeriod.Annual, 18],
    [BillingPeriod.Annual, 36],
    [BillingPeriod.OneTime, 12],
    [BillingPeriod.OneTime, 5],
  ])('NFR-ACC-03, FR-PAY-02: %s over %i months totals monthly x months to the cent', (period, months) => {
    for (const startsAt of [day('2027-03-01'), day('2027-01-31'), day('2028-02-29')]) {
      const rows = build(period, { startsAt, endsAt: defaultEndDate(startsAt, months) });
      expect(total(rows).toString()).toBe(price.multiplyBy(months).toString());
    }
  });

  it('FR-PAY-02: a quarterly 13-month term ends with a one-month instalment', () => {
    const rows = build(BillingPeriod.Quarterly, { endsAt: defaultEndDate(start, 13) });
    expect(rows.map((r) => r.amount.toString())).toEqual(['148.20', '148.20', '148.20', '148.20', '49.40']);
  });
});
