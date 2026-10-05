import { defaultEndDate, defaultRenewalDate } from './contractTerm';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('defaultEndDate', () => {
  it.each([
    ['FR-CON-03: 1 March 2027 + 12 months ends on 29 February 2028 (leap year)', '2027-03-01', 12, '2028-02-29'],
    ['FR-CON-03: a 1 January start ends on 31 December', '2027-01-01', 12, '2027-12-31'],
    ['FR-CON-03: a 31 January start clamps the month before taking a day off', '2027-01-31', 1, '2027-02-27'],
    ['FR-CON-03: 31 January + 12 months', '2027-01-31', 12, '2028-01-30'],
    ['FR-CON-03: 29 February start + 12 months clamps to 28 February', '2028-02-29', 12, '2029-02-27'],
    ['FR-CON-03: a 24 month term', '2027-03-01', 24, '2029-02-28'],
  ])('%s', (_title, start, months, expected) => {
    expect(iso(defaultEndDate(day(start), months))).toBe(expected);
  });

  it.each([0, -1, 1.5])('FR-CON-03: refuses %s months', (months) => {
    expect(() => defaultEndDate(day('2027-03-01'), months)).toThrow();
  });
});

describe('defaultRenewalDate', () => {
  it('FR-CON-07: lead times 60, 30, 7 and an end of 29 February 2028 give 31 December 2027', () => {
    expect(iso(defaultRenewalDate(day('2028-02-29'), [60, 30, 7]))).toBe('2027-12-31');
  });

  it('FR-CON-07: uses the largest lead time whatever the order', () => {
    expect(iso(defaultRenewalDate(day('2028-02-29'), [7, 90, 30]))).toBe('2027-12-01');
  });

  it('FR-CON-07: no lead times falls back to the end date', () => {
    expect(iso(defaultRenewalDate(day('2028-02-29'), []))).toBe('2028-02-29');
  });
});
