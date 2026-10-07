import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { checkPurchase, familyDiscount, price, upgradePrice, type PurchaseContext } from './membershipPricing';

const silverFee = Money.of('60.00');
const goldFee = Money.of('100.00');
const half = Percent.of(50);
const none = Percent.zero();

describe('price and upgradePrice (SRS 3.3 price table)', () => {
  it.each([
    ['FR-MPAY-02, NFR-ACC-05: individual, Bronze to Silver', () => price(silverFee, none), '60.00'],
    ['FR-MPAY-02, NFR-ACC-05: individual, Bronze to Gold', () => price(goldFee, none), '100.00'],
    ['FR-MPAY-03, NFR-ACC-05: individual or corporate, Silver to Gold', () => upgradePrice(goldFee, silverFee, none), '40.00'],
    ['FR-FAM-04, NFR-ACC-05: family member, Silver', () => price(silverFee, half), '30.00'],
    ['FR-FAM-04, NFR-ACC-05: family member, Gold', () => price(goldFee, half), '50.00'],
    ['FR-FAM-04, NFR-ACC-05: family member, Silver to Gold', () => upgradePrice(goldFee, silverFee, half), '20.00'],
    ['FR-TIR-04, NFR-ACC-05: Silver renewal, individual', () => price(silverFee, none), '60.00'],
    ['FR-MPAY-03, NFR-ACC-05: Bronze to Gold in one step costs the full Gold price', () => upgradePrice(goldFee, Money.zero(), none), '100.00'],
    ['FR-FAM-04, NFR-ACC-05: family member, Bronze to Gold with a 50% discount', () => upgradePrice(goldFee, Money.zero(), half), '50.00'],
  ])('%s', (_title, compute, expected) => {
    expect(compute().toString()).toBe(expected);
  });

  it('NFR-ACC-05: a 33.33% discount on 60.00 is 40.00 (half up, no float drift)', () => {
    expect(price(silverFee, Percent.of('33.33')).toString()).toBe('40.00');
  });

  it('NFR-ACC-05: rounds the price, not the discount, half up (10.01 at 50% is 5.01)', () => {
    expect(price(Money.of('10.01'), half).toString()).toBe('5.01');
  });

  it('NFR-ACC-05: 0.1 + 0.2 style sums never drift', () => {
    expect(price(Money.of('0.30'), Percent.of(10)).toString()).toBe('0.27');
  });

  it('FR-MPAY-03: an upgrade is never below zero', () => {
    expect(upgradePrice(silverFee, goldFee, none).toString()).toBe('0.00');
  });

  it('FR-FAM-04: a 100% discount makes the price 0.00', () => {
    expect(price(goldFee, Percent.of(100)).toString()).toBe('0.00');
  });
});

describe('familyDiscount', () => {
  it.each(['SILVER', 'GOLD', 'VIP'] as const)('FR-FAM-04: an Active principal who is %s gives the discount', (effectiveTier) => {
    expect(familyDiscount({ status: 'ACTIVE', effectiveTier }, half).toString()).toBe('50.00');
  });

  it('FR-FAM-04: a Bronze principal gives no discount, so a family Silver costs 60.00', () => {
    const d = familyDiscount({ status: 'ACTIVE', effectiveTier: 'BRONZE' }, half);
    expect(price(silverFee, d).toString()).toBe('60.00');
  });

  it.each(['SUSPENDED', 'CLOSED'] as const)('FR-FAM-04: a %s principal gives no discount', (status) => {
    expect(familyDiscount({ status, effectiveTier: 'GOLD' }, half).isZero()).toBe(true);
  });

  it('FR-FAM-04: no principal gives no discount', () => {
    expect(familyDiscount(null, half).isZero()).toBe(true);
  });
});

describe('checkPurchase', () => {
  const base: PurchaseContext = {
    status: 'ACTIVE',
    effectiveTier: 'BRONZE',
    paidTier: null,
    hasSponsoredTerm: false,
    kind: 'NEW',
    targetTier: 'SILVER',
  };
  const check = (patch: Partial<PurchaseContext>) => checkPurchase({ ...base, ...patch });

  it('FR-MPAY-02: any Active member can buy Silver or Gold', () => {
    expect(check({})).toEqual({ allowed: true, warnings: [] });
    expect(check({ targetTier: 'GOLD' })).toEqual({ allowed: true, warnings: [] });
  });

  it('FR-MPAY-02: VIP and Bronze cannot be bought', () => {
    expect(check({ targetTier: 'VIP' })).toEqual({ allowed: false, reason: 'TIER_NOT_PURCHASABLE' });
    expect(check({ targetTier: 'BRONZE' })).toEqual({ allowed: false, reason: 'TIER_NOT_PURCHASABLE' });
  });

  it.each(['SUSPENDED', 'CLOSED'] as const)('FR-MPAY-03: a %s member cannot pay', (status) => {
    expect(check({ status })).toEqual({ allowed: false, reason: 'MEMBER_NOT_ACTIVE' });
  });

  it('FR-MPAY-03: Silver to Gold upgrade is allowed', () => {
    expect(check({ kind: 'UPGRADE', effectiveTier: 'SILVER', paidTier: 'SILVER', targetTier: 'GOLD' }).allowed).toBe(true);
  });

  it('FR-MPAY-03: a sponsored Silver employee can upgrade to Gold', () => {
    expect(check({ kind: 'UPGRADE', effectiveTier: 'SILVER', hasSponsoredTerm: true, targetTier: 'GOLD' }).allowed).toBe(true);
  });

  it('FR-MPAY-03: a payment cannot move a member to a lower tier', () => {
    expect(check({ kind: 'UPGRADE', effectiveTier: 'GOLD', paidTier: 'GOLD', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
    expect(check({ kind: 'NEW', effectiveTier: 'GOLD', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
  });

  it('FR-MPAY-03: an upgrade to the same tier is refused', () => {
    expect(check({ kind: 'UPGRADE', effectiveTier: 'SILVER', paidTier: 'SILVER', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
  });

  it('FR-MPAY-03: Bronze to Gold in one step is allowed', () => {
    expect(check({ kind: 'NEW', targetTier: 'GOLD' }).allowed).toBe(true);
  });

  it('D5(a): a member on a downgrade Silver term can buy Silver as a new purchase, with no warning', () => {
    expect(check({ effectiveTier: 'SILVER', targetTier: 'SILVER' })).toEqual({ allowed: true, warnings: [] });
  });

  it('D5(b): a sponsored Silver employee can buy Silver, with a warning', () => {
    expect(check({ effectiveTier: 'SILVER', hasSponsoredTerm: true, targetTier: 'SILVER' })).toEqual({
      allowed: true,
      warnings: ['SPONSORED_SILVER_OWN_TERM'],
    });
  });

  it('D5(c): a VIP member has nothing to buy', () => {
    expect(check({ effectiveTier: 'VIP', targetTier: 'GOLD', kind: 'UPGRADE' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
    expect(check({ effectiveTier: 'VIP', targetTier: 'GOLD' })).toEqual({ allowed: false, reason: 'NOT_A_HIGHER_TIER' });
  });

  it('FR-MPAY-04: a new purchase while a paid term is running is refused (at most one paid term)', () => {
    expect(check({ effectiveTier: 'SILVER', paidTier: 'SILVER', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'PAID_TERM_RUNNING' });
  });

  it('FR-TIR-04: a renewal needs a paid term of the same tier', () => {
    expect(check({ kind: 'RENEWAL', effectiveTier: 'SILVER', paidTier: 'SILVER', targetTier: 'SILVER' }).allowed).toBe(true);
    expect(check({ kind: 'RENEWAL', effectiveTier: 'GOLD', paidTier: 'GOLD', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOTHING_TO_RENEW' });
    expect(check({ kind: 'RENEWAL', targetTier: 'SILVER' })).toEqual({ allowed: false, reason: 'NOTHING_TO_RENEW' });
  });
});
