import { Money } from '../../pricing/domain/Money';
import { attentionItems, ATTENTION_SAMPLE, lastChange, salesByRange } from './ExecutiveDefinitions';

describe('attentionItems (FR-DSH-11)', () => {
  it('lists cities in no zone and roles with no users, with the full count', () => {
    const items = attentionItems({
      citiesInNoZone: [{ id: 'c1', name: 'Vlorë' }],
      rolesWithoutUsers: [
        { id: 'r1', name: 'Reception' },
        { id: 'r2', name: 'CEO' },
      ],
    });
    expect(items).toEqual([
      { key: 'CITY_NO_ZONE', count: 1, examples: [{ id: 'c1', name: 'Vlorë' }] },
      { key: 'ROLE_NO_USERS', count: 2, examples: [{ id: 'r1', name: 'Reception' }, { id: 'r2', name: 'CEO' }] },
    ]);
  });

  it('has no item for a kind with nothing to report', () => {
    expect(attentionItems({ citiesInNoZone: [], rolesWithoutUsers: [] })).toEqual([]);
  });

  it('shows a few examples but counts them all', () => {
    const cities = Array.from({ length: ATTENTION_SAMPLE + 5 }, (_, i) => ({ id: `c${i}`, name: `City ${i}` }));
    const [item] = attentionItems({ citiesInNoZone: cities, rolesWithoutUsers: [] });
    expect(item.count).toBe(ATTENTION_SAMPLE + 5);
    expect(item.examples).toHaveLength(ATTENTION_SAMPLE);
  });
});

describe('lastChange (FR-DSH-11)', () => {
  const entries = [
    { at: new Date('2026-03-01T10:00:00Z'), fields: ['discountCapPercent'] },
    { at: new Date('2026-05-01T10:00:00Z'), fields: ['offerNumberPrefix'] },
    { at: new Date('2026-04-01T10:00:00Z'), fields: ['discountCapPercent', 'currency'] },
  ];

  it('is the latest entry of the setting', () => {
    expect(lastChange(entries)).toEqual(new Date('2026-05-01T10:00:00Z'));
  });

  it('counts only entries that changed the field asked for', () => {
    expect(lastChange(entries, 'discountCapPercent')).toEqual(new Date('2026-04-01T10:00:00Z'));
  });

  it('is null when nothing changed it', () => {
    expect(lastChange([], 'discountCapPercent')).toBeNull();
    expect(lastChange(entries, 'missing')).toBeNull();
  });
});

describe('salesByRange (FR-DSH-12)', () => {
  const won = (day: string, value: string | null) => ({ at: new Date(`${day}T00:00:00.000Z`), annualValue: value ? Money.of(value) : null });
  const ranges = [
    { from: '2026-08-01', to: '2026-08-31' },
    { from: '2026-09-01', to: '2026-09-30' },
  ];

  it('counts each won deal in the month of its won date, with the sum of their values', () => {
    const series = salesByRange([won('2026-08-31', '100.50'), won('2026-09-01', '592.80'), won('2026-09-30', '600.00'), won('2026-09-15', null)], ranges);
    expect(series.map((point) => [point.dealsWon, point.salesValue.toString()])).toEqual([[1, '100.50'], [3, '1192.80']]);
  });

  it('adds up to the whole period and shows a month with no sale as zero', () => {
    const deals = [won('2026-09-10', '10.00'), won('2026-09-11', '20.00')];
    const series = salesByRange(deals, ranges);
    expect(series.reduce((sum, point) => sum + point.dealsWon, 0)).toBe(deals.length);
    expect(series[0]).toMatchObject({ dealsWon: 0 });
    expect(series[0].salesValue.toString()).toBe('0.00');
  });
});
