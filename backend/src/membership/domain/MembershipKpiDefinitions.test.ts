import { Money } from '../../pricing/domain/Money';
import { downgradeCount, expiringMembershipCount, renewalFigures, renewalRate, revenueRows, totalRow, type PaymentFigure } from './MembershipKpiDefinitions';
import { day } from './testSupport';

const payments = (kind: PaymentFigure['kind'], tier: PaymentFigure['tier'], count: number, amount: string, voided = false): PaymentFigure[] =>
  Array.from({ length: count }, () => ({ kind, tier, amount: Money.of(amount), voided }));

// SRS 9.3 worked example, March 2027.
const march: PaymentFigure[] = [
  ...payments('NEW', 'SILVER', 4, '60.00'),
  ...payments('NEW', 'GOLD', 1, '100.00'),
  ...payments('UPGRADE', 'GOLD', 2, '40.00'),
  ...payments('RENEWAL', 'SILVER', 7, '60.00'),
  ...payments('RENEWAL', 'GOLD', 3, '100.00'),
];

describe('NFR-ACC-06 worked example (SRS 9.3, March 2027)', () => {
  it('NFR-ACC-05, NFR-ACC-06: revenue by kind and tier and the total row of 17 payments and 1,140.00', () => {
    const rows = revenueRows(march);
    expect(rows.map((r) => [r.kind, r.tier, r.count, r.total.toString()])).toEqual([
      ['NEW', 'SILVER', 4, '240.00'],
      ['NEW', 'GOLD', 1, '100.00'],
      ['UPGRADE', 'GOLD', 2, '80.00'],
      ['RENEWAL', 'SILVER', 7, '420.00'],
      ['RENEWAL', 'GOLD', 3, '300.00'],
    ]);
    const total = totalRow(rows);
    expect([total.count, total.total.toString()]).toEqual([17, '1140.00']);
  });

  it('NFR-ACC-06: new paid memberships are 5 and upgrades are 2 for 80.00', () => {
    const rows = revenueRows(march);
    const count = (kind: string) => rows.filter((r) => r.kind === kind).reduce((n, r) => n + r.count, 0);
    expect(count('NEW')).toBe(5);
    expect(count('UPGRADE')).toBe(2);
    expect(totalRow(rows.filter((r) => r.kind === 'UPGRADE')).total.toString()).toBe('80.00');
  });

  it('NFR-ACC-06: 10 Silver and 5 Gold terms ended, 7 and 3 renewed: 15 due, 10 renewed, 66.67%', () => {
    const terms = [
      ...Array.from({ length: 10 }, (_, i) => ({ tier: 'SILVER' as const, endsOn: day('2027-03-15'), renewalPaidOn: i < 7 ? day('2027-03-10') : null })),
      ...Array.from({ length: 5 }, (_, i) => ({ tier: 'GOLD' as const, endsOn: day('2027-03-20'), renewalPaidOn: i < 3 ? day('2027-03-18') : null })),
    ];
    const figures = renewalFigures(terms, 0, { from: day('2027-03-01'), to: day('2027-03-31') });
    expect(figures).toEqual({ due: 15, renewed: 10 });
    expect(renewalRate(figures.renewed, figures.due)!.toString()).toBe('66.67');
  });

  it('NFR-ACC-06: the 3 Silver and 2 Gold terms not renewed give 5 downgrades (3 + 2)', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ fromTier: 'SILVER' as const, toTier: 'BRONZE' as const, reason: 'NOT_RENEWED' as const })),
      ...Array.from({ length: 2 }, () => ({ fromTier: 'GOLD' as const, toTier: 'SILVER' as const, reason: 'NOT_RENEWED' as const })),
    ];
    expect(downgradeCount(rows)).toEqual({
      total: 5,
      byPath: { 'SILVER>BRONZE': 3, 'GOLD>SILVER': 2 },
      byReason: { NOT_RENEWED: 5 },
    });
  });
});

describe('revenueRows', () => {
  it('NFR-ACC-05: voided payments are not counted', () => {
    const rows = revenueRows([...payments('NEW', 'SILVER', 2, '60.00'), ...payments('NEW', 'SILVER', 1, '60.00', true)]);
    expect(totalRow(rows).total.toString()).toBe('120.00');
    expect(rows[0].count).toBe(2);
  });

  it('NFR-ACC-05: no payments give an empty list and a total of 0.00', () => {
    expect(revenueRows([])).toEqual([]);
    expect(totalRow([])).toEqual({ count: 0, total: Money.zero() });
  });

  it('NFR-ACC-05: sums without float drift', () => {
    const rows = revenueRows([...payments('NEW', 'SILVER', 3, '0.10'), ...payments('NEW', 'SILVER', 1, '0.20')]);
    expect(totalRow(rows).total.toString()).toBe('0.50');
  });
});

describe('renewalRate', () => {
  it('NFR-ACC-06: with no renewals due the rate is null, shown as a dash', () => {
    expect(renewalRate(0, 0)).toBeNull();
  });

  it.each([
    [1, 3, '33.33'],
    [2, 3, '66.67'],
    [3, 3, '100.00'],
    [0, 4, '0.00'],
  ])('NFR-ACC-06: %i of %i renewed is %s%%', (renewed, due, expected) => {
    expect(renewalRate(renewed, due)!.toString()).toBe(expected);
  });
});

describe('renewalFigures', () => {
  const period = { from: day('2027-03-01'), to: day('2027-03-31') };

  it('NFR-ACC-06: end date plus grace days decides whether a term is due in the period', () => {
    const terms = [{ tier: 'SILVER' as const, endsOn: day('2027-02-20'), renewalPaidOn: null }];
    expect(renewalFigures(terms, 0, period).due).toBe(0);
    expect(renewalFigures(terms, 14, period).due).toBe(1);
  });

  it('NFR-ACC-06: a renewal recorded after end plus grace days does not count as renewed', () => {
    const terms = [{ tier: 'SILVER' as const, endsOn: day('2027-03-10'), renewalPaidOn: day('2027-03-15') }];
    expect(renewalFigures(terms, 0, period)).toEqual({ due: 1, renewed: 0 });
    expect(renewalFigures(terms, 5, period)).toEqual({ due: 1, renewed: 1 });
  });

  it('NFR-ACC-06: Bronze and VIP terms are never due', () => {
    const terms = [
      { tier: 'BRONZE' as const, endsOn: day('2027-03-10'), renewalPaidOn: null },
      { tier: 'VIP' as const, endsOn: day('2027-03-10'), renewalPaidOn: null },
    ];
    expect(renewalFigures(terms, 0, period).due).toBe(0);
  });

  it('NFR-ACC-06: the first and last day of the period are inside it', () => {
    const terms = [
      { tier: 'GOLD' as const, endsOn: day('2027-03-01'), renewalPaidOn: null },
      { tier: 'GOLD' as const, endsOn: day('2027-03-31'), renewalPaidOn: null },
      { tier: 'GOLD' as const, endsOn: day('2027-04-01'), renewalPaidOn: null },
    ];
    expect(renewalFigures(terms, 0, period).due).toBe(2);
  });
});

describe('downgradeCount', () => {
  it('NFR-ACC-06: counts the four downgrade reasons and ignores corrections and increases', () => {
    const rows = [
      { fromTier: 'GOLD' as const, toTier: 'SILVER' as const, reason: 'NOT_RENEWED' as const },
      { fromTier: 'SILVER' as const, toTier: 'BRONZE' as const, reason: 'COMPANY_CONTRACT_ENDED' as const },
      { fromTier: 'SILVER' as const, toTier: 'BRONZE' as const, reason: 'LEFT_COMPANY' as const },
      { fromTier: 'VIP' as const, toTier: 'BRONZE' as const, reason: 'VIP_ENDED' as const },
      { fromTier: 'GOLD' as const, toTier: 'SILVER' as const, reason: 'CORRECTION' as const },
      { fromTier: 'BRONZE' as const, toTier: 'SILVER' as const, reason: 'PURCHASE' as const },
      { fromTier: 'BRONZE' as const, toTier: 'SILVER' as const, reason: 'NOT_RENEWED' as const },
    ];
    const result = downgradeCount(rows);
    expect(result.total).toBe(4);
    expect(result.byReason).toEqual({ NOT_RENEWED: 1, COMPANY_CONTRACT_ENDED: 1, LEFT_COMPANY: 1, VIP_ENDED: 1 });
  });

  it('NFR-ACC-06: no rows give a total of 0', () => {
    expect(downgradeCount([])).toEqual({ total: 0, byPath: {}, byReason: {} });
  });
});

describe('expiringMembershipCount', () => {
  it('FR-TIR-10: counts paid terms ending within the window and ignores sponsored and ended ones', () => {
    const today = day('2027-06-01');
    const terms = [
      { source: 'PAID' as const, endsOn: day('2027-07-01') },
      { source: 'PAID' as const, endsOn: day('2027-07-02') },
      { source: 'PAID' as const, endsOn: day('2027-05-31') },
      { source: 'SPONSORED' as const, endsOn: null },
      { source: 'VIP' as const, endsOn: day('2027-06-10') },
    ];
    expect(expiringMembershipCount(terms, today, 30)).toBe(1);
  });
});
