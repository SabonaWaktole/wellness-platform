import { ContractStatus } from './Contract';
import { isValidOrUpcoming, shouldBecomeFormerClient, StandingContract } from './companyStanding';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = day('2026-06-15');
const contract = (status: ContractStatus, startsAt: string, endsAt: string): StandingContract => ({
  status,
  startsAt: day(startsAt),
  endsAt: day(endsAt),
});

describe('FR-CON-17 valid or upcoming', () => {
  it.each([
    ['Active, ends today', ContractStatus.Active, '2026-01-01', '2026-06-15', true],
    ['Active, ended yesterday', ContractStatus.Active, '2026-01-01', '2026-06-14', false],
    ['Active, starts tomorrow', ContractStatus.Active, '2026-06-16', '2027-06-15', true],
    ['Pending Signature, starts tomorrow', ContractStatus.PendingSignature, '2026-06-16', '2027-06-15', true],
    ['Pending Signature, start already passed', ContractStatus.PendingSignature, '2026-06-01', '2027-06-01', false],
    ['Draft, starts tomorrow', ContractStatus.Draft, '2026-06-16', '2027-06-15', true],
    ['Draft, starts today', ContractStatus.Draft, '2026-06-15', '2027-06-14', false],
    ['Expired', ContractStatus.Expired, '2025-01-01', '2026-01-01', false],
    ['Cancelled, still within its term', ContractStatus.Cancelled, '2026-01-01', '2027-01-01', false],
    ['Suspended', ContractStatus.Suspended, '2026-01-01', '2027-01-01', false],
  ])('%s', (_label, status, startsAt, endsAt, expected) => {
    expect(isValidOrUpcoming(contract(status, startsAt, endsAt), today)).toBe(expected);
  });
});

describe('FR-CON-17 Former client', () => {
  const expired = contract(ContractStatus.Expired, '2025-01-01', '2026-01-01');
  const active = contract(ContractStatus.Active, '2026-01-01', '2027-01-01');

  it('is reached when nothing valid or upcoming is left', () => {
    expect(shouldBecomeFormerClient([expired], today, false)).toBe(true);
    expect(shouldBecomeFormerClient([], today, false)).toBe(true);
  });
  it('is not reached while another contract is valid', () => {
    expect(shouldBecomeFormerClient([expired, active], today, false)).toBe(false);
  });
  it('is not reached while a renewal deal is open', () => {
    expect(shouldBecomeFormerClient([expired], today, true)).toBe(false);
  });
});
