import { sponsorEndDate } from './sponsorEndDate';
import { day, iso } from './testSupport';

const contract = (startsOn: string, endsOn: string) => ({ startsOn: day(startsOn), endsOn: day(endsOn) });

describe('sponsorEndDate', () => {
  it('FR-EMP-09: the end date is the end of the contract valid today', () => {
    expect(iso(sponsorEndDate([contract('2026-03-01', '2027-02-28')], day('2026-09-01'))!)).toBe('2027-02-28');
  });

  it('FR-EMP-09: CTR ending 28.02.2027 and a renewal starting 01.03.2027 move the end to the new end', () => {
    const contracts = [contract('2026-03-01', '2027-02-28'), contract('2027-03-01', '2028-02-29')];
    expect(iso(sponsorEndDate(contracts, day('2026-09-01'))!)).toBe('2028-02-29');
    expect(iso(sponsorEndDate(contracts, day('2027-03-01'))!)).toBe('2028-02-29');
  });

  it('FR-EMP-09: a one-day gap does not extend the end date', () => {
    const contracts = [contract('2026-03-01', '2027-02-28'), contract('2027-03-02', '2028-03-01')];
    expect(iso(sponsorEndDate(contracts, day('2026-09-01'))!)).toBe('2027-02-28');
  });

  it('FR-EMP-09: follows a chain of back-to-back renewals', () => {
    const contracts = [contract('2026-01-01', '2026-12-31'), contract('2027-01-01', '2027-12-31'), contract('2028-01-01', '2028-12-31')];
    expect(iso(sponsorEndDate(contracts, day('2026-06-01'))!)).toBe('2028-12-31');
  });

  it('FR-EMP-09: an overlapping later contract extends the end date', () => {
    const contracts = [contract('2026-03-01', '2027-02-28'), contract('2027-01-15', '2028-01-14')];
    expect(iso(sponsorEndDate(contracts, day('2026-09-01'))!)).toBe('2028-01-14');
  });

  it('FR-EMP-09: a contract inside the valid one does not shorten it', () => {
    const contracts = [contract('2026-03-01', '2027-02-28'), contract('2026-04-01', '2026-06-30')];
    expect(iso(sponsorEndDate(contracts, day('2026-05-01'))!)).toBe('2027-02-28');
  });

  it('FR-EMP-09: no contract valid today means no end date', () => {
    expect(sponsorEndDate([contract('2026-03-01', '2027-02-28')], day('2027-03-01'))).toBeNull();
    expect(sponsorEndDate([contract('2027-03-01', '2028-02-28')], day('2027-02-01'))).toBeNull();
    expect(sponsorEndDate([], day('2027-02-01'))).toBeNull();
  });

  it('FR-EMP-09: a valid contract on its last day and its first day counts', () => {
    expect(sponsorEndDate([contract('2026-03-01', '2027-02-28')], day('2027-02-28'))).not.toBeNull();
    expect(sponsorEndDate([contract('2026-03-01', '2027-02-28')], day('2026-03-01'))).not.toBeNull();
  });
});
