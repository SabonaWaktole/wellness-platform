import { BillingPeriod, Contract } from '../../domain/Contract';
import { reachableContract } from './contractAccess';

const contractOf = (clientAssignedUserId: string | null) =>
  Contract.create({
    id: 'c1',
    tenantId: 't1',
    clientId: 'client-1',
    planName: 'Gold',
    amount: 100,
    billingPeriod: BillingPeriod.Monthly,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    createdByUserId: 'someone',
    assignedUserId: 'someone',
    clientAssignedUserId,
  });

describe('reachableContract (FR-RBAC-11: a contract follows its company)', () => {
  const own = { kind: 'owners' as const, userIds: ['me'], includeUnowned: false };

  it('returns a contract whose company is in scope', () => {
    const contract = contractOf('me');
    expect(reachableContract(contract, own)).toBe(contract);
  });

  it('treats a contract whose company is out of scope as not found, whoever created it', () => {
    expect(() => reachableContract(contractOf('other'), own)).toThrow('Contract not found');
  });

  it('treats a missing contract as not found', () => {
    expect(() => reachableContract(null, { kind: 'all' })).toThrow('Contract not found');
  });

  it('TEAM reaches the contracts of unassigned companies', () => {
    const team = { kind: 'owners' as const, userIds: ['me'], includeUnowned: true };
    expect(reachableContract(contractOf(null), team)).toBeDefined();
  });
});
