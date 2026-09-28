import { BillingPeriod, Contract } from '../domain/Contract';
import { administrator, ceo, reception } from '../../../tests/support/access';
import { presentClientContracts, presentContract, presentContractDetail } from './presentContract';

const contract = () =>
  Contract.create({
    id: 'c1',
    tenantId: 't1',
    clientId: 'client-1',
    clientName: 'Acme',
    planName: 'Gold',
    amount: 100,
    billingPeriod: BillingPeriod.Monthly,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    createdByUserId: 'u1',
    notes: 'Discount agreed at 10%',
    paymentSummary: { total: 1200, paid: 300, outstanding: 900, unpaidCount: 9, overdueCount: 1 },
  });

/** Every key anywhere in `value`, nested objects and arrays included. */
const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, v]) => [key, ...keysOf(v)]);
  }
  return [];
};
const MONEY = /amount|price|payment|paid|outstanding|overdue|total/i;

describe('presentContract (FR-RBAC-06)', () => {
  it('gives the Administrator the whole contract', () => {
    const view = presentContract(contract(), administrator());
    expect(view.amount).toBe(100);
    expect(view.paymentSummary).toBeDefined();
    expect(view.notes).toBe('Discount agreed at 10%');
  });

  it('reduces Reception to contract validity, with no money anywhere', () => {
    const view = presentContract(contract(), reception());

    expect(view).toEqual({
      id: 'c1',
      clientId: 'client-1',
      clientName: 'Acme',
      planName: 'Gold',
      status: 'DRAFT',
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2026-12-31'),
      daysUntilExpiry: expect.any(Number),
    });
    expect(keysOf(view).filter((key) => MONEY.test(key))).toEqual([]);
  });

  it('keeps the money for a reader who holds commercial.view and payments.view (the CEO)', () => {
    const view = presentContract(contract(), ceo());
    expect(view.amount).toBe(100);
    expect(view.paymentSummary).toBeDefined();
    expect(view.notes).toBeUndefined();
  });

  it('drops the payment summary without payments.view, and the amount without commercial.view', () => {
    expect(presentContract(contract(), administrator({ revoke: ['payments.view'] })).paymentSummary).toBeUndefined();
    expect(presentContract(contract(), administrator({ revoke: ['commercial.view'] })).amount).toBeUndefined();
  });

  it('drops payment rows and history from Reception\'s detail view', () => {
    const detail = presentContractDetail(
      { contract: contract(), payments: [{ id: 'p1', amount: 100 } as any], history: [{ id: 'h1' } as any], permittedActions: [] },
      reception()
    );
    expect(detail).not.toHaveProperty('payments');
    expect(detail.history).toEqual([]);
    expect(keysOf(detail).filter((key) => MONEY.test(key))).toEqual([]);
  });

  it('drops what a client owes from Reception\'s client summary', () => {
    const view = presentClientContracts(
      {
        contracts: [contract()],
        summary: {
          hasActiveContract: false, activeContractId: null, activePlanName: null, activeEndsAt: null,
          daysUntilExpiry: null, totalContracts: 1, outstanding: 900, overdueCount: 1,
        },
      },
      reception()
    );
    expect(keysOf(view).filter((key) => MONEY.test(key))).toEqual(['totalContracts']);
  });
});
