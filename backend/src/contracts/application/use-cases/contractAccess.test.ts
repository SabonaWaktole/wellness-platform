import { BillingPeriod, Contract } from '../../domain/Contract';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { accessWith, administrator, salesManager, salesUser } from '../../../../tests/support/access';
import { assertCanAccessContract, canAccessContract } from './contractAccess';

const contract = (createdByUserId: string, assignedUserId: string | null = null) =>
  Contract.create({
    id: 'c1',
    tenantId: 't1',
    clientId: 'client-1',
    planName: 'Gold',
    amount: 100,
    billingPeriod: BillingPeriod.Monthly,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    createdByUserId,
    assignedUserId,
  });

describe('contractAccess', () => {
  it('FR-RBAC-11 an OWN-scoped caller reaches a contract they created or are assigned', () => {
    const me = salesUser({ userId: 'me' });
    expect(canAccessContract(contract('me'), me)).toBe(true);
    expect(canAccessContract(contract('someone', 'me'), me)).toBe(true);
    expect(canAccessContract(contract('someone', 'other'), me)).toBe(false);
  });

  it('FR-RBAC-11 a wider scope reaches every contract', () => {
    expect(canAccessContract(contract('someone', 'other'), salesManager({ userId: 'me' }))).toBe(true);
    expect(canAccessContract(contract('someone', 'other'), administrator({ userId: 'me' }))).toBe(true);
  });

  it('FR-RBAC-05 reads the scope of the key asked for, not the role name', () => {
    const readsAllWritesOwn = accessWith(
      { 'contracts.validity.view': 'ALL' as any, 'contracts.manage': 'OWN' as any },
      { userId: 'me' }
    );
    expect(canAccessContract(contract('someone'), readsAllWritesOwn, 'contracts.validity.view')).toBe(true);
    expect(canAccessContract(contract('someone'), readsAllWritesOwn, 'contracts.manage')).toBe(false);
  });

  it('assertCanAccessContract throws PermissionDeniedError outside scope', () => {
    expect(() => assertCanAccessContract(contract('someone'), salesUser({ userId: 'me' }))).toThrow(
      PermissionDeniedError
    );
  });
});
