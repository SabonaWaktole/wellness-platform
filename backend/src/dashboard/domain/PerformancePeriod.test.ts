import { bucketsOf, instantsOf, InvalidPeriodError, previousPeriod, resolvePeriod } from './PerformancePeriod';

describe('FR-PRF-02: the period presets', () => {
  // Wednesday 14 October 2026.
  const today = '2026-10-14';

  it.each([
    ['THIS_WEEK', { from: '2026-10-12', to: '2026-10-18' }],
    ['THIS_MONTH', { from: '2026-10-01', to: '2026-10-31' }],
    ['LAST_MONTH', { from: '2026-09-01', to: '2026-09-30' }],
    ['THIS_QUARTER', { from: '2026-10-01', to: '2026-12-31' }],
    ['THIS_YEAR', { from: '2026-01-01', to: '2026-12-31' }],
  ] as const)('%s', (preset, expected) => {
    expect(resolvePeriod(preset, today)).toEqual(expected);
  });

  it('starts the week on Monday, also when today is a Sunday or a Monday', () => {
    expect(resolvePeriod('THIS_WEEK', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(resolvePeriod('THIS_WEEK', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('handles January for last month and a leap February', () => {
    expect(resolvePeriod('LAST_MONTH', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(resolvePeriod('THIS_MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('takes a custom range as given and refuses a backwards or invalid one', () => {
    expect(resolvePeriod('CUSTOM', today, { from: '2026-03-02', to: '2026-03-09' })).toEqual({ from: '2026-03-02', to: '2026-03-09' });
    expect(() => resolvePeriod('CUSTOM', today, { from: '2026-03-09', to: '2026-03-02' })).toThrow(InvalidPeriodError);
    expect(() => resolvePeriod('CUSTOM', today, { from: '2026-02-30', to: '2026-03-02' })).toThrow(InvalidPeriodError);
    expect(() => resolvePeriod('CUSTOM', today)).toThrow(InvalidPeriodError);
  });
});

describe('FR-PRF-06: the previous period', () => {
  it.each([
    ['THIS_WEEK', { from: '2026-10-12', to: '2026-10-18' }, { from: '2026-10-05', to: '2026-10-11' }],
    ['THIS_MONTH', { from: '2026-10-01', to: '2026-10-31' }, { from: '2026-09-01', to: '2026-09-30' }],
    ['THIS_MONTH', { from: '2027-01-01', to: '2027-01-31' }, { from: '2026-12-01', to: '2026-12-31' }],
    ['LAST_MONTH', { from: '2026-09-01', to: '2026-09-30' }, { from: '2026-08-01', to: '2026-08-31' }],
    ['THIS_QUARTER', { from: '2027-01-01', to: '2027-03-31' }, { from: '2026-10-01', to: '2026-12-31' }],
    ['THIS_YEAR', { from: '2026-01-01', to: '2026-12-31' }, { from: '2025-01-01', to: '2025-12-31' }],
    ['CUSTOM', { from: '2026-03-10', to: '2026-03-16' }, { from: '2026-03-03', to: '2026-03-09' }],
  ] as const)('%s %j', (preset, range, expected) => {
    expect(previousPeriod(preset, range)).toEqual(expected);
  });
});

describe('FR-PRF-05: the days as instants in the workspace time zone', () => {
  it('ends the last day at workspace midnight, so 23:30 on it is inside', () => {
    // Europe/Tirane is UTC+1 on 31 January and UTC+2 on 31 March after the change.
    const { start, end } = instantsOf({ from: '2026-01-01', to: '2026-01-31' }, 'Europe/Tirane');
    expect(start.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    const wonAt = new Date('2026-01-31T22:30:00.000Z'); // 23:30 in Tirana
    expect(wonAt >= start && wonAt < end).toBe(true);
  });

  it('follows the clock change inside a range', () => {
    const { start, end } = instantsOf({ from: '2026-03-01', to: '2026-03-31' }, 'Europe/Tirane');
    expect(start.toISOString()).toBe('2026-02-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T22:00:00.000Z');
  });
});

describe('FR-PRF-08: buckets of a range', () => {
  it('splits into Monday to Sunday weeks, the first and last cut to the range', () => {
    expect(bucketsOf({ from: '2026-10-07', to: '2026-10-20' }, 'WEEK')).toEqual([
      { from: '2026-10-07', to: '2026-10-11' },
      { from: '2026-10-12', to: '2026-10-18' },
      { from: '2026-10-19', to: '2026-10-20' },
    ]);
  });

  it('splits into calendar months', () => {
    expect(bucketsOf({ from: '2026-08-15', to: '2026-10-10' }, 'MONTH')).toEqual([
      { from: '2026-08-15', to: '2026-08-31' },
      { from: '2026-09-01', to: '2026-09-30' },
      { from: '2026-10-01', to: '2026-10-10' },
    ]);
  });
});
