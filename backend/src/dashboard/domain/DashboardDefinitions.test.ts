import { Money } from '../../pricing/domain/Money';
import { conversionRate, EMPTY_INDICATORS, figuresOf } from './KpiDefinitions';
import { isLead, leadCount, lostAnalysis, pipelineByStage, pipelineTotal } from './DashboardDefinitions';

const m = (value: string) => Money.of(value);

describe('§5.3: lead and pipeline value (Q14)', () => {
  it('a lead is an open deal in New Lead or Contacted', () => {
    expect(['NEW_LEAD', 'CONTACTED'].every(isLead)).toBe(true);
    expect(['INTERESTED', 'NEGOTIATION', 'WON', 'LOST'].some(isLead)).toBe(false);
  });

  it('counts a deal with no offer in the number and adds nothing to the value', () => {
    const stages = pipelineByStage([
      { ownerId: 'a', stageKey: 'NEW_LEAD', annualValue: null },
      { ownerId: 'a', stageKey: 'NEW_LEAD', annualValue: m('592.80') },
      { ownerId: 'b', stageKey: 'NEGOTIATION', annualValue: m('1200.00') },
      { ownerId: 'b', stageKey: 'WON', annualValue: m('480.00') },
    ]);
    expect(stages.map((s) => s.stage)).toEqual(['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_PREPARED', 'OFFER_SENT', 'FOLLOW_UP', 'NEGOTIATION']);
    expect(stages[0]).toMatchObject({ count: 2 });
    expect(stages[0].value.toString()).toBe('592.80');
    expect(stages[1]).toMatchObject({ count: 0 });
    expect(stages[1].value.toString()).toBe('0.00');
    const total = pipelineTotal(stages);
    expect(total.count).toBe(3);
    expect(total.value.toString()).toBe('1792.80');
  });

  it('counts leads across New Lead and Contacted only', () => {
    expect(
      leadCount([
        { ownerId: 'a', stageKey: 'NEW_LEAD', annualValue: null },
        { ownerId: 'a', stageKey: 'CONTACTED', annualValue: null },
        { ownerId: 'a', stageKey: 'OFFER_SENT', annualValue: null },
      ])
    ).toBe(2);
  });
});

describe('§5.3: lost-deal analysis (FR-DSH-10)', () => {
  const lost = [
    { reasonId: 'price', annualValue: m('600.00') },
    { reasonId: 'price', annualValue: m('480.00') },
    { reasonId: 'competitor', annualValue: null },
    { reasonId: null, annualValue: m('10.10') },
  ];

  it('groups by reason with count and value (a tie goes to the larger value), and the counts add up to the lost deals', () => {
    const groups = lostAnalysis(lost);
    expect(groups.map((g) => [g.reasonId, g.count, g.value.toString()])).toEqual([
      ['price', 2, '1080.00'],
      [null, 1, '10.10'],
      ['competitor', 1, '0.00'],
    ]);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(lost.length);
  });
});

describe('NFR-ACC-04: the §5.3 worked example', () => {
  it('4 won and 6 lost give 40.0% and €2,872.80', () => {
    const raw = EMPTY_INDICATORS();
    raw.dealsWon = 4;
    raw.dealsLost = 6;
    raw.totalValue = ['592.80', '600.00', '1200.00', '480.00'].reduce((sum, v) => sum.add(m(v)), Money.zero());
    expect(conversionRate(4, 6)).toBe(40);
    expect(figuresOf(raw).conversionRate).toBe(40);
    expect(figuresOf(raw).totalValue.toString()).toBe('2872.80');
  });

  it('shows no rate, not 0%, when nothing closed', () => {
    expect(conversionRate(0, 0)).toBeNull();
  });
});
