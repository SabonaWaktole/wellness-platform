import { effectiveTierOn, validTermsOn, type MemberTermValue } from './MemberTerm';
import { day } from './testSupport';

const term = (tier: MemberTermValue['tier'], source: MemberTermValue['source'], startsOn: string, endsOn: string | null): MemberTermValue => ({
  tier,
  source,
  startsOn: day(startsOn),
  endsOn: endsOn ? day(endsOn) : null,
});

describe('effectiveTierOn', () => {
  const gold = term('GOLD', 'PAID', '2027-01-01', '2027-12-31');
  const sponsored = term('SILVER', 'SPONSORED', '2026-06-01', null);

  it('FR-TIR-02: a paid Gold term and a sponsored Silver term give Gold', () => {
    expect(effectiveTierOn([gold, sponsored], true, 0, day('2027-06-01'))).toBe('GOLD');
  });

  it('FR-TIR-02: when the Gold term ends and the contract is valid the member is Silver', () => {
    expect(effectiveTierOn([gold, sponsored], true, 0, day('2028-01-01'))).toBe('SILVER');
  });

  it('FR-TIR-02: a sponsored term with no valid contract is Bronze', () => {
    expect(effectiveTierOn([sponsored], false, 0, day('2027-06-01'))).toBe('BRONZE');
  });

  it('FR-TIR-02: paid Silver and VIP give VIP', () => {
    const silver = term('SILVER', 'PAID', '2027-01-01', '2027-12-31');
    const vip = term('VIP', 'VIP', '2027-04-10', '2028-04-09');
    expect(effectiveTierOn([silver, vip], true, 0, day('2027-06-01'))).toBe('VIP');
  });

  it('FR-TIR-02: Bronze is the floor when there are no terms', () => {
    expect(effectiveTierOn([], true, 0, day('2027-06-01'))).toBe('BRONZE');
  });

  it('FR-TIR-02: a term has not started yet before its start date', () => {
    expect(effectiveTierOn([gold], true, 0, day('2026-12-31'))).toBe('BRONZE');
  });

  it('FR-TIR-02, FR-MEM-06: a Gold term that ended yesterday is Bronze today with no job having run', () => {
    expect(effectiveTierOn([gold], true, 0, day('2028-01-01'))).toBe('BRONZE');
    expect(effectiveTierOn([gold], true, 0, day('2027-12-31'))).toBe('GOLD');
  });

  it('FR-TIR-05: with 14 grace days a Gold term ending 31.12 is still Gold on 14.01 and not on 15.01', () => {
    expect(effectiveTierOn([gold], true, 14, day('2028-01-10'))).toBe('GOLD');
    expect(effectiveTierOn([gold], true, 14, day('2028-01-14'))).toBe('GOLD');
    expect(effectiveTierOn([gold], true, 14, day('2028-01-15'))).toBe('BRONZE');
  });

  it('FR-TIR-05: grace days do not stretch a VIP or correction term', () => {
    const vip = term('VIP', 'VIP', '2027-04-10', '2028-04-09');
    const correction = term('GOLD', 'CORRECTION', '2027-01-01', '2027-12-31');
    expect(effectiveTierOn([vip], true, 14, day('2028-04-10'))).toBe('BRONZE');
    expect(effectiveTierOn([correction], true, 14, day('2028-01-01'))).toBe('BRONZE');
  });

  it('FR-TIR-06: Gold then a downgrade Silver then Bronze, two years after the Gold term ended', () => {
    const silver = term('SILVER', 'DOWNGRADE', '2028-01-01', '2028-12-31');
    expect(effectiveTierOn([gold, silver], true, 0, day('2028-06-01'))).toBe('SILVER');
    expect(effectiveTierOn([gold, silver], true, 0, day('2029-01-01'))).toBe('BRONZE');
  });

  it('FR-TIR-02: validTermsOn lists only the terms that count on the date', () => {
    expect(validTermsOn([gold, sponsored], false, 0, day('2027-06-01'))).toEqual([gold]);
  });
});
