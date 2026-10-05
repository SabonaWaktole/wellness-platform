import { ContractStatus } from '../domain/Contract';
import { validityBadge } from './validityBadge';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const term = (status: ContractStatus, startsAt: string, endsAt: string) => ({ status, startsAt: day(startsAt), endsAt: day(endsAt) });
const TODAY = day('2027-06-15');

describe('validityBadge', () => {
  it('FR-CON-20: an Active term that starts tomorrow reads "Not valid: Not started"', () => {
    const badge = validityBadge([term(ContractStatus.Active, '2027-06-16', '2028-06-15')], TODAY, 30);
    expect(badge).toMatchObject({ status: 'NOT_VALID', reason: 'NOT_STARTED' });
  });

  it('FR-CON-20: on the end date it is still valid, the day after it is expired', () => {
    const active = [term(ContractStatus.Active, '2026-06-16', '2027-06-15')];
    expect(validityBadge(active, TODAY, 0)).toMatchObject({ status: 'EXPIRING_SOON', reason: null, daysLeft: 0 });
    expect(validityBadge(active, day('2027-06-16'), 0)).toMatchObject({ status: 'NOT_VALID', reason: 'EXPIRED' });
  });

  it('FR-CON-21: Valid and Expiring soon carry the start and end date', () => {
    expect(validityBadge([term(ContractStatus.Active, '2027-03-01', '2028-02-29')], TODAY, 30)).toEqual({
      status: 'VALID',
      reason: null,
      startsOn: '2027-03-01',
      endsOn: '2028-02-29',
      daysLeft: 259,
    });
    expect(validityBadge([term(ContractStatus.Active, '2026-07-01', '2027-07-01')], TODAY, 30)).toMatchObject({
      status: 'EXPIRING_SOON',
      daysLeft: 16,
    });
  });

  it('FR-CON-21: a Suspended contract is Not valid with the status as the reason', () => {
    expect(validityBadge([term(ContractStatus.Suspended, '2027-01-01', '2027-12-31')], TODAY, 30)).toMatchObject({
      status: 'NOT_VALID',
      reason: 'SUSPENDED',
    });
  });

  it('FR-CON-21: a company that never had a contract is Not valid, with no dates', () => {
    expect(validityBadge([], TODAY, 30)).toEqual({ status: 'NOT_VALID', reason: 'NO_CONTRACT', startsOn: null, endsOn: null, daysLeft: null });
  });

  it('FR-CON-22: an Expired 2026 term and an Active 2027 term show Valid', () => {
    const badge = validityBadge(
      [term(ContractStatus.Expired, '2026-01-01', '2026-12-31'), term(ContractStatus.Active, '2027-01-01', '2027-12-31')],
      TODAY,
      30
    );
    expect(badge).toMatchObject({ status: 'VALID', startsOn: '2027-01-01', endsOn: '2027-12-31' });
  });

  it('FR-CON-22: of two Active terms valid today, the one ending last speaks', () => {
    const badge = validityBadge(
      [term(ContractStatus.Active, '2027-01-01', '2027-09-30'), term(ContractStatus.Active, '2027-02-01', '2028-01-31')],
      TODAY,
      30
    );
    expect(badge.endsOn).toBe('2028-01-31');
  });

  it('FR-CON-22: with none valid today, the latest contract speaks', () => {
    const badge = validityBadge(
      [term(ContractStatus.Expired, '2025-01-01', '2025-12-31'), term(ContractStatus.Cancelled, '2026-01-01', '2026-12-31')],
      TODAY,
      30
    );
    expect(badge).toMatchObject({ status: 'NOT_VALID', reason: 'CANCELLED', endsOn: '2026-12-31' });
  });
});
