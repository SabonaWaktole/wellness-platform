import { planDowngrades, tierTransitions, type JobTerm } from './memberTermExpiry';
import { day, iso } from './testSupport';

const term = (id: string, tier: JobTerm['tier'], source: JobTerm['source'], startsOn: string, endsOn: string | null, followsTermId: string | null = null): JobTerm => ({
  id,
  tier,
  source,
  startsOn: day(startsOn),
  endsOn: endsOn ? day(endsOn) : null,
  followsTermId,
});

describe('planDowngrades (FR-TIR-05, FR-TIR-06, D4)', () => {
  const gold = term('g1', 'GOLD', 'PAID', '2027-01-01', '2027-12-31');

  it('FR-TIR-06 an unrenewed Gold term is followed by Silver for twelve months from the day after', () => {
    const [plan] = planDowngrades([gold], 0, 12, day('2028-01-01'));
    expect(plan).toMatchObject({ followsTermId: 'g1', tier: 'SILVER' });
    expect([iso(plan.startsOn), iso(plan.endsOn)]).toEqual(['2028-01-01', '2028-12-31']);
  });

  it('FR-TIR-06 plans nothing on the last day of the term, and nothing for a Silver paid term', () => {
    expect(planDowngrades([gold], 0, 12, day('2027-12-31'))).toEqual([]);
    expect(planDowngrades([term('s1', 'SILVER', 'PAID', '2027-01-01', '2027-12-31')], 0, 12, day('2030-01-01'))).toEqual([]);
  });

  it('FR-TIR-05 with 14 grace days the Silver term starts on 15.01 and nothing is planned on 10.01', () => {
    expect(planDowngrades([gold], 14, 12, day('2028-01-10'))).toEqual([]);
    const [plan] = planDowngrades([gold], 14, 12, day('2028-01-15'));
    expect(iso(plan.startsOn)).toBe('2028-01-15');
  });

  it('NFR-REL-02 a term that already has a downgrade pointing at it plans nothing', () => {
    const followed = term('d1', 'SILVER', 'DOWNGRADE', '2028-01-01', '2028-12-31', 'g1');
    expect(planDowngrades([gold, followed], 0, 12, day('2029-06-01'))).toEqual([]);
  });

  it('a renewal bought in time means no downgrade', () => {
    const renewal = term('g2', 'GOLD', 'PAID', '2028-01-01', '2028-12-31');
    expect(planDowngrades([gold, renewal], 0, 12, day('2028-02-01'))).toEqual([]);
  });

  it('a VIP, correction or sponsored term never plans a downgrade', () => {
    const others = [term('v', 'VIP', 'VIP', '2027-01-01', '2027-12-31'), term('c', 'GOLD', 'CORRECTION', '2027-01-01', '2027-12-31'), term('s', 'SILVER', 'SPONSORED', '2027-01-01', null)];
    expect(planDowngrades(others, 0, 12, day('2030-01-01'))).toEqual([]);
  });
});

describe('tierTransitions (FR-TIR-06, FR-TIR-08, D4)', () => {
  const base = { sponsorValid: false, graceDays: 0 };

  it('FR-TIR-08 a Gold term not renewed is Silver the next day, then Bronze the day after the Silver term, each on its own date', () => {
    const terms = [term('g', 'GOLD', 'PAID', '2027-01-01', '2027-12-31'), term('d', 'SILVER', 'DOWNGRADE', '2028-01-01', '2028-12-31', 'g')];
    const rows = tierTransitions({ ...base, terms, startingTier: 'GOLD', after: day('2027-06-01'), today: day('2029-03-01') });
    expect(rows.map((r) => [iso(r.on), r.from, r.to, r.reason])).toEqual([
      ['2028-01-01', 'GOLD', 'SILVER', 'Not renewed'],
      ['2029-01-01', 'SILVER', 'BRONZE', 'Not renewed'],
    ]);
  });

  it('NFR-REL-02 nothing is returned once the recorded tier already matches', () => {
    const terms = [term('g', 'GOLD', 'PAID', '2027-01-01', '2027-12-31'), term('d', 'SILVER', 'DOWNGRADE', '2028-01-01', '2028-12-31', 'g')];
    expect(tierTransitions({ ...base, terms, startingTier: 'SILVER', after: day('2028-01-01'), today: day('2028-06-01') })).toEqual([]);
  });

  it('FR-TIR-05 the grace days push the step-down back', () => {
    const terms = [term('g', 'GOLD', 'PAID', '2027-01-01', '2027-12-31')];
    const rows = tierTransitions({ ...base, graceDays: 14, terms, startingTier: 'GOLD', after: day('2027-06-01'), today: day('2028-01-14') });
    expect(rows).toEqual([]);
    const later = tierTransitions({ ...base, graceDays: 14, terms, startingTier: 'GOLD', after: day('2027-06-01'), today: day('2028-01-15') });
    expect(later.map((r) => [iso(r.on), r.to])).toEqual([['2028-01-15', 'BRONZE']]);
  });

  it('FR-VIP-04 a VIP term that ended falls back to the next tier with the reason VIP ended', () => {
    const terms = [term('p', 'SILVER', 'PAID', '2027-01-01', '2028-12-31'), term('v', 'VIP', 'VIP', '2027-03-01', '2028-02-29')];
    const rows = tierTransitions({ ...base, terms, startingTier: 'VIP', after: day('2027-03-01'), today: day('2028-03-01') });
    expect(rows.map((r) => [iso(r.on), r.from, r.to, r.reason])).toEqual([['2028-03-01', 'VIP', 'SILVER', 'VIP ended']]);
  });

  it('FR-VIP-04 a VIP term extended before it ended changes nothing', () => {
    const terms = [term('v1', 'VIP', 'VIP', '2027-03-01', '2028-02-29'), term('v2', 'VIP', 'VIP', '2028-03-01', '2029-02-28')];
    expect(tierTransitions({ ...base, terms, startingTier: 'VIP', after: day('2027-03-01'), today: day('2028-06-01') })).toEqual([]);
  });

  it('FR-TIR-09 a correction term that ended is recorded as Correction ended', () => {
    const terms = [term('c', 'GOLD', 'CORRECTION', '2027-01-01', '2027-12-31')];
    const rows = tierTransitions({ ...base, terms, startingTier: 'GOLD', after: day('2027-01-01'), today: day('2028-01-01') });
    expect(rows.map((r) => [r.to, r.reason])).toEqual([['BRONZE', 'Correction ended']]);
  });
});
