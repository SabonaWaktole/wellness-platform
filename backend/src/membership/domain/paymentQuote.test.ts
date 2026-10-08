import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { quotePayment, type QuoteInput, type QuoteTerm } from './paymentQuote';
import type { TermSource } from './MemberTerm';
import type { Tier } from './Tier';
import { day, iso } from './testSupport';

const term = (id: string, tier: Tier, source: TermSource, startsOn: string, endsOn: string | null): QuoteTerm => ({
  id,
  tier,
  source,
  startsOn: day(startsOn),
  endsOn: endsOn === null ? null : day(endsOn),
});

const base: QuoteInput = {
  status: 'ACTIVE',
  terms: [],
  sponsorValid: true,
  graceDays: 0,
  fees: { SILVER: Money.of('60.00'), GOLD: Money.of('100.00') },
  termMonths: { SILVER: 12, GOLD: 12 },
  familyDiscountPercent: Percent.of('50.00'),
  principal: null,
  kind: 'NEW',
  targetTier: 'SILVER',
  receivedOn: day('2027-03-15'),
};
const quote = (patch: Partial<QuoteInput>) => {
  const result = quotePayment({ ...base, ...patch });
  if (!result.allowed) throw new Error(`refused: ${result.reason}`);
  return result.quote;
};
const shape = (q: ReturnType<typeof quote>) => [q.kind, q.fromTier, q.toTier, q.amount.toString(), iso(q.startsOn), iso(q.endsOn)];

describe('quotePayment: the SRS 3.3 price table', () => {
  it.each([
    ['Bronze to Silver', {}, '60.00'],
    ['Bronze to Gold', { targetTier: 'GOLD' as const }, '100.00'],
    ['family Bronze to Silver (Silver principal)', { principal: { status: 'ACTIVE' as const, effectiveTier: 'SILVER' as const } }, '30.00'],
    ['family Bronze to Gold (Gold principal)', { targetTier: 'GOLD' as const, principal: { status: 'ACTIVE' as const, effectiveTier: 'GOLD' as const } }, '50.00'],
    ['family with a Bronze principal pays the list price', { principal: { status: 'ACTIVE' as const, effectiveTier: 'BRONZE' as const } }, '60.00'],
    ['family with a suspended principal pays the list price', { principal: { status: 'SUSPENDED' as const, effectiveTier: 'GOLD' as const } }, '60.00'],
  ])('FR-MPAY-02, NFR-ACC-05: %s costs %s', (_name, patch, amount) => {
    expect(quote(patch).amount.toString()).toBe(amount);
  });

  it('FR-MPAY-02: the payment stores the list fee, the discount percentage and the amount', () => {
    const q = quote({ principal: { status: 'ACTIVE', effectiveTier: 'GOLD' } });
    expect([q.listFee.toString(), q.discountPercent.toString(), q.amount.toString()]).toEqual(['60.00', '50.00', '30.00']);
  });

  it('FR-MPAY-02: a changed fee applies to the next quote only', () => {
    expect(quote({ fees: { SILVER: Money.of('75.50'), GOLD: Money.of('100.00') } }).amount.toString()).toBe('75.50');
  });
});

describe('quotePayment: upgrades', () => {
  const silver = [term('t1', 'SILVER', 'PAID', '2027-03-15', '2028-03-14')];

  it('FR-MPAY-03, FR-MPAY-04: Silver paid 15.03.2027, upgraded 15.09.2027, pays 40.00; Silver ends 14.09.2027 and Gold runs 15.09.2027 to 14.09.2028', () => {
    const q = quote({ kind: 'UPGRADE', targetTier: 'GOLD', terms: silver, receivedOn: day('2027-09-15') });
    expect(shape(q)).toEqual(['UPGRADE', 'SILVER', 'GOLD', '40.00', '2027-09-15', '2028-09-14']);
    expect(q.closes.map((c) => [c.termId, iso(c.originalEndsOn), iso(c.newEndsOn)])).toEqual([['t1', '2028-03-14', '2027-09-14']]);
  });

  it('FR-MPAY-03: a sponsored Silver employee upgrading to Gold pays 40.00 and the sponsored term is left alone', () => {
    const q = quote({ kind: 'UPGRADE', targetTier: 'GOLD', terms: [term('s1', 'SILVER', 'SPONSORED', '2027-01-01', null)] });
    expect([q.amount.toString(), q.closes]).toEqual(['40.00', []]);
  });

  it('FR-FAM-04: the same discount applies to the difference', () => {
    const q = quote({ kind: 'UPGRADE', targetTier: 'GOLD', terms: silver, principal: { status: 'ACTIVE', effectiveTier: 'GOLD' } });
    expect(q.amount.toString()).toBe('20.00');
  });

  it('FR-MPAY-04: at most one paid term at a time: an upgrade closes the running paid term, a purchase beside it is refused', () => {
    const refused = quotePayment({ ...base, terms: silver, receivedOn: day('2027-09-15'), kind: 'NEW', targetTier: 'SILVER' });
    expect(refused).toEqual({ allowed: false, reason: 'PAID_TERM_RUNNING' });
  });

  it('FR-MPAY-03: Gold to Silver is not offered, and neither is Bronze as an upgrade', () => {
    const gold = [term('g1', 'GOLD', 'PAID', '2027-03-15', '2028-03-14')];
    expect(quotePayment({ ...base, terms: gold, kind: 'UPGRADE', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
    expect(quotePayment({ ...base, kind: 'UPGRADE', targetTier: 'GOLD' })).toEqual({ allowed: false, reason: 'NOTHING_TO_UPGRADE' });
  });

  it('D5(a): buying Silver on a downgrade Silver term is a New purchase that closes the downgrade term the day before', () => {
    const q = quote({ terms: [term('d1', 'SILVER', 'DOWNGRADE', '2028-01-15', '2029-01-14')], receivedOn: day('2028-06-01') });
    expect(shape(q)).toEqual(['NEW', 'SILVER', 'SILVER', '60.00', '2028-06-01', '2029-05-31']);
    expect(q.closes.map((c) => [c.termId, iso(c.newEndsOn)])).toEqual([['d1', '2028-05-31']]);
  });

  it('D5(a): upgrading from a downgrade Silver term to Gold pays the difference and closes it', () => {
    const q = quote({ kind: 'UPGRADE', targetTier: 'GOLD', terms: [term('d1', 'SILVER', 'DOWNGRADE', '2028-01-15', '2029-01-14')], receivedOn: day('2028-06-01') });
    expect([q.amount.toString(), q.closes.length]).toEqual(['40.00', 1]);
  });

  it('D5(b): a sponsored Silver employee buying Silver is allowed, with a warning', () => {
    const q = quote({ terms: [term('s1', 'SILVER', 'SPONSORED', '2027-01-01', null)] });
    expect(q.warnings).toEqual(['SPONSORED_SILVER_OWN_TERM']);
  });

  it('FR-MPAY-02: a sponsored term whose contract is not valid does not count', () => {
    const q = quote({ sponsorValid: false, terms: [term('s1', 'SILVER', 'SPONSORED', '2027-01-01', null)], targetTier: 'GOLD' });
    expect([q.fromTier, q.amount.toString(), q.warnings]).toEqual(['BRONZE', '100.00', []]);
  });

  it('D5(c): a VIP member has nothing to buy', () => {
    expect(quotePayment({ ...base, terms: [term('v1', 'VIP', 'VIP', '2027-01-01', '2028-01-01')], targetTier: 'GOLD' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
  });

  it.each(['SUSPENDED', 'CLOSED'] as const)('FR-MPAY-03: a %s member cannot pay', (status) => {
    expect(quotePayment({ ...base, status })).toEqual({ allowed: false, reason: 'MEMBER_NOT_ACTIVE' });
  });
});

describe('quotePayment: renewals', () => {
  const silver = [term('t1', 'SILVER', 'PAID', '2027-03-15', '2028-03-14')];

  it('FR-TIR-04: renewing 20 days early loses no day: the new term starts the day after the old one ends', () => {
    const q = quote({ kind: 'RENEWAL', terms: silver, receivedOn: day('2028-02-23') });
    expect(shape(q)).toEqual(['RENEWAL', 'SILVER', 'SILVER', '60.00', '2028-03-15', '2029-03-14']);
    expect(q.closes).toEqual([]);
  });

  it('FR-TIR-04: a renewal inside the grace days continues from the end date', () => {
    const q = quote({ kind: 'RENEWAL', terms: silver, graceDays: 14, receivedOn: day('2028-03-20') });
    expect([q.kind, iso(q.startsOn)]).toEqual(['RENEWAL', '2028-03-15']);
  });

  it('FR-TIR-04: a second renewal continues from the end of the term already renewed', () => {
    const renewed = [...silver, term('t2', 'SILVER', 'PAID', '2028-03-15', '2029-03-14')];
    expect(iso(quote({ kind: 'RENEWAL', terms: renewed, receivedOn: day('2028-02-23') }).startsOn)).toBe('2029-03-15');
  });

  it('FR-TIR-04: nothing to renew without a paid term of that tier', () => {
    expect(quotePayment({ ...base, kind: 'RENEWAL', terms: silver, targetTier: 'GOLD' })).toEqual({ allowed: false, reason: 'NOTHING_TO_RENEW' });
    expect(quotePayment({ ...base, kind: 'RENEWAL' })).toEqual({ allowed: false, reason: 'NOTHING_TO_RENEW' });
  });
});
