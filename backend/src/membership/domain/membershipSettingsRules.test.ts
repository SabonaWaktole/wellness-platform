import { MembershipSettings, InvalidMembershipSettingsError } from './MembershipSettings';
import { TierSetting, InvalidTierSettingError } from './TierSetting';
import { checkDiscounts, InvalidBenefitError } from './BenefitTable';
import { DEFAULT_TIER_SETTINGS } from './DefaultMembership';

const tier = (name: 'BRONZE' | 'SILVER' | 'GOLD' | 'VIP') => {
  const d = DEFAULT_TIER_SETTINGS.find((t) => t.tier === name)!;
  return TierSetting.rebuild(name, { labelSq: d.labelSq, labelEn: d.labelEn, colour: d.colour, fee: d.fee, termMonths: d.termMonths });
};

describe('TierSetting (FR-TIR-01)', () => {
  it('FR-TIR-01 changing the Gold fee to 110 stores 110.00', () => {
    expect(tier('GOLD').with({ fee: '110' }).fee).toBe('110.00');
  });

  it.each(['BRONZE', 'VIP'] as const)('FR-TIR-01 %s cannot be given a fee', (name) => {
    expect(() => tier(name).with({ fee: '10.00' })).toThrow(InvalidTierSettingError);
  });

  it.each(['0', '0.00', '-5', '60.123', 'abc', ''])('FR-TIR-01 refuses the Silver fee %p', (fee) => {
    expect(() => tier('SILVER').with({ fee })).toThrow(expect.objectContaining({ field: 'fee' }));
  });

  it('FR-TIR-01 Silver and Gold cannot lose their fee', () => {
    expect(() => tier('GOLD').with({ fee: null })).toThrow(expect.objectContaining({ field: 'fee' }));
  });

  it.each([0, 61, 1.5])('FR-TIR-01 refuses a term of %p months', (termMonths) => {
    expect(() => tier('GOLD').with({ termMonths })).toThrow(expect.objectContaining({ field: 'termMonths' }));
  });

  it('FR-TIR-01 VIP has a term, Bronze has none', () => {
    expect(tier('VIP').with({ termMonths: 24 }).termMonths).toBe(24);
    expect(() => tier('BRONZE').with({ termMonths: 12 })).toThrow(expect.objectContaining({ field: 'termMonths' }));
  });

  it('FR-TIR-01 labels are required in Albanian and English, and the colour is a hex value', () => {
    expect(() => tier('GOLD').with({ labelSq: ' ' })).toThrow(expect.objectContaining({ field: 'labelSq' }));
    expect(() => tier('GOLD').with({ labelEn: '' })).toThrow(expect.objectContaining({ field: 'labelEn' }));
    expect(() => tier('GOLD').with({ colour: 'gold' })).toThrow(expect.objectContaining({ field: 'colour' }));
    expect(tier('GOLD').with({ colour: '#abcdef' }).colour).toBe('#ABCDEF');
  });
});

describe('MembershipSettings (FR-TIR-05, FR-TIR-10, FR-FAM-04, FR-MEM-03, FR-MPAY-05, FR-VIP-04)', () => {
  const base = MembershipSettings.defaults('t');

  it('the defaults are 50%, 0 grace days, 30 days, WP, RCP and 30 days', () => {
    expect(base.toJSON()).toEqual({
      familyDiscountPercent: '50.00',
      graceDays: 0,
      expiringSoonDays: 30,
      memberPrefix: 'WP',
      receiptPrefix: 'RCP',
      vipReviewNoticeDays: 30,
    });
  });

  it.each([
    ['FR-FAM-04', { familyDiscountPercent: '100.01' }, 'familyDiscountPercent'],
    ['FR-FAM-04', { familyDiscountPercent: '12.345' }, 'familyDiscountPercent'],
    ['FR-TIR-05', { graceDays: 61 }, 'graceDays'],
    ['FR-TIR-05', { graceDays: -1 }, 'graceDays'],
    ['FR-TIR-10', { expiringSoonDays: 0 }, 'expiringSoonDays'],
    ['FR-TIR-10', { expiringSoonDays: 366 }, 'expiringSoonDays'],
    ['FR-VIP-04', { vipReviewNoticeDays: 0 }, 'vipReviewNoticeDays'],
    ['FR-MEM-03', { memberPrefix: 'w' }, 'memberPrefix'],
    ['FR-MEM-03', { memberPrefix: 'ABCDEFG' }, 'memberPrefix'],
    ['FR-MPAY-05', { receiptPrefix: 'R' }, 'receiptPrefix'],
  ])('%s refuses %j', (_id, patch, field) => {
    expect(() => base.with(patch)).toThrow(InvalidMembershipSettingsError);
    expect(() => base.with(patch)).toThrow(expect.objectContaining({ field }));
  });

  it('accepts the bounds', () => {
    const next = base.with({ familyDiscountPercent: '0', graceDays: 60, expiringSoonDays: 365, memberPrefix: 'AB12CD', receiptPrefix: 'XY' });
    expect(next.familyDiscountPercent).toBe('0.00');
    expect(next.graceDays).toBe(60);
  });
});

describe('checkDiscounts (FR-BEN-01, FR-BEN-02)', () => {
  it('FR-BEN-01 keeps two-decimal percentages and treats empty as no discount', () => {
    expect(checkDiscounts({ SILVER: 10, GOLD: '35.5', BRONZE: null, VIP: '' })).toEqual({
      SILVER: '10.00',
      GOLD: '35.50',
      BRONZE: null,
      VIP: null,
    });
  });

  it.each([101, '10.005', -1, 'abc'])('FR-BEN-02 refuses %p', (value) => {
    expect(() => checkDiscounts({ SILVER: value })).toThrow(InvalidBenefitError);
  });

  it('FR-BEN-01 refuses an unknown tier', () => {
    expect(() => checkDiscounts({ PLATINUM: 5 })).toThrow(InvalidBenefitError);
  });
});
