import { validityOn } from './memberValidity';
import { day } from './testSupport';

describe('validityOn', () => {
  it('FR-MEM-06: an Active member is valid, at least as Bronze', () => {
    expect(validityOn('ACTIVE', 'BRONZE', null)).toEqual({ valid: true, reason: null, tier: 'BRONZE', validUntil: null });
  });

  it('FR-MEM-06: a Gold term ended yesterday still gives a valid member, as Bronze today', () => {
    const result = validityOn('ACTIVE', 'BRONZE', null);
    expect(result.valid).toBe(true);
  });

  it('FR-MEM-06: a suspended member is "Not valid: Suspended"', () => {
    expect(validityOn('SUSPENDED', 'GOLD', day('2027-12-31'))).toMatchObject({ valid: false, reason: 'SUSPENDED', tier: 'GOLD' });
  });

  it('FR-MEM-06: a closed member is not valid with the status as the reason', () => {
    expect(validityOn('CLOSED', 'SILVER', null)).toMatchObject({ valid: false, reason: 'CLOSED' });
  });

  it.each(['BRONZE', 'SILVER', 'GOLD', 'VIP'] as const)('FR-MEM-06: the tier %s is never the reason for not being valid', (tier) => {
    expect(validityOn('ACTIVE', tier, null).valid).toBe(true);
  });

  it('FR-MEM-06: carries the valid-until date through', () => {
    expect(validityOn('ACTIVE', 'GOLD', day('2027-12-31')).validUntil).toEqual(day('2027-12-31'));
  });
});
