import { TIERS, canChangeTier, higherTier, tierRank, type Tier, type TierChangeTrigger } from './Tier';

describe('Tier', () => {
  it('FR-TIR-02: orders the four tiers Bronze < Silver < Gold < VIP', () => {
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3]);
    expect(higherTier('SILVER', 'GOLD')).toBe('GOLD');
    expect(higherTier('VIP', 'GOLD')).toBe('VIP');
  });

  // SRS 3.2: "The allowed changes of tier, and only these".
  const allowed: Array<[Tier, Tier, TierChangeTrigger]> = [
    ['BRONZE', 'SILVER', 'PAYMENT_NEW'],
    ['BRONZE', 'GOLD', 'PAYMENT_NEW'],
    ['SILVER', 'GOLD', 'PAYMENT_UPGRADE'],
    ['GOLD', 'SILVER', 'TERM_ENDED'],
    ['SILVER', 'BRONZE', 'TERM_ENDED'],
    ['SILVER', 'BRONZE', 'CONTRACT_INVALID'],
    ['BRONZE', 'SILVER', 'CONTRACT_VALID'],
    ['BRONZE', 'VIP', 'VIP_APPROVED'],
    ['SILVER', 'VIP', 'VIP_APPROVED'],
    ['GOLD', 'VIP', 'VIP_APPROVED'],
    ['VIP', 'GOLD', 'VIP_ENDED'],
    ['VIP', 'SILVER', 'VIP_ENDED'],
    ['VIP', 'BRONZE', 'VIP_ENDED'],
    ['SILVER', 'BRONZE', 'EMPLOYEE_REMOVED'],
  ];

  it.each(allowed)('FR-TIR-06: %s to %s is allowed on %s', (from, to, trigger) => {
    expect(canChangeTier(from, to, trigger)).toBe(true);
  });

  it.each<[Tier, Tier, TierChangeTrigger]>([
    ['GOLD', 'SILVER', 'PAYMENT_NEW'],
    ['GOLD', 'SILVER', 'PAYMENT_UPGRADE'],
    ['GOLD', 'BRONZE', 'TERM_ENDED'],
    ['BRONZE', 'GOLD', 'TERM_ENDED'],
    ['SILVER', 'VIP', 'PAYMENT_UPGRADE'],
    ['GOLD', 'GOLD', 'PAYMENT_NEW'],
    ['VIP', 'BRONZE', 'TERM_ENDED'],
    ['BRONZE', 'SILVER', 'VIP_ENDED'],
  ])('FR-TIR-06: %s to %s is refused on %s', (from, to, trigger) => {
    expect(canChangeTier(from, to, trigger)).toBe(false);
  });
});
