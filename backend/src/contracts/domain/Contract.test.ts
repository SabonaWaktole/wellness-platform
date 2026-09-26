import { BillingPeriod, Contract, ContractStatus } from './Contract';

function makeContract(overrides: Partial<Parameters<typeof Contract.create>[0]> = {}) {
  return Contract.create({
    id: 'c1',
    tenantId: 'tenant-1',
    clientId: 'client-1',
    planName: 'Gold',
    amount: 100,
    billingPeriod: BillingPeriod.Monthly,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    createdByUserId: 'user-1',
    ...overrides,
  });
}

describe('Contract', () => {
  it('creates a Draft contract', () => {
    const contract = makeContract();

    expect(contract.status).toBe(ContractStatus.Draft);
    expect(contract.planName).toBe('Gold');
    expect(contract.activatedAt).toBeNull();
  });

  it('refuses a blank plan name', () => {
    expect(() => makeContract({ planName: '   ' })).toThrow(/name the plan/);
  });

  it('refuses a negative amount', () => {
    expect(() => makeContract({ amount: -1 })).toThrow(/non-negative/);
  });

  it('refuses a term that ends before it starts', () => {
    expect(() =>
      makeContract({ startsAt: new Date('2026-06-01'), endsAt: new Date('2026-01-01') })
    ).toThrow(/cannot end before it starts/);
  });

  describe('transitions', () => {
    it('activates a Draft contract and stamps activatedAt', () => {
      const contract = makeContract();
      contract.activate();

      expect(contract.status).toBe(ContractStatus.Active);
      expect(contract.activatedAt).toBeInstanceOf(Date);
    });

    it('refuses to activate twice', () => {
      const contract = makeContract();
      contract.activate();

      expect(() => contract.activate()).toThrow(/Invalid state transition/);
    });

    it('expires only an Active contract', () => {
      const draft = makeContract();
      expect(() => draft.expire()).toThrow(/Invalid state transition/);

      const active = makeContract();
      active.activate();
      active.expire();
      expect(active.status).toBe(ContractStatus.Expired);
    });

    it('cancels from Draft and from Active, but not from a terminal state', () => {
      const draft = makeContract();
      draft.cancel();
      expect(draft.status).toBe(ContractStatus.Cancelled);
      expect(draft.cancelledAt).toBeInstanceOf(Date);

      const active = makeContract();
      active.activate();
      active.cancel();
      expect(active.status).toBe(ContractStatus.Cancelled);

      expect(() => active.cancel()).toThrow(/Invalid state transition/);
    });
  });

  describe('renewal eligibility', () => {
    it('allows renewal only from a terminal state', () => {
      const draft = makeContract();
      expect(draft.canRenew()).toBe(false);

      const active = makeContract();
      active.activate();
      expect(active.canRenew()).toBe(false);

      active.expire();
      expect(active.canRenew()).toBe(true);
    });
  });

  describe('daysUntilExpiry', () => {
    it('counts whole calendar days, ignoring the time of day', () => {
      // Ends tomorrow morning; asked late tonight. Raw millisecond arithmetic
      // would floor this to 0 — the calendar answer is 1.
      const contract = makeContract({ endsAt: new Date('2026-06-02T09:00:00Z') });

      expect(contract.daysUntilExpiry(new Date('2026-06-01T23:30:00Z'))).toBe(1);
    });

    it('goes negative once the term has passed', () => {
      const contract = makeContract({ endsAt: new Date('2026-06-01T00:00:00Z') });

      expect(contract.daysUntilExpiry(new Date('2026-06-04T00:00:00Z'))).toBe(-3);
    });
  });

  describe('isExpiringWithin', () => {
    it('is true for an Active contract inside the window', () => {
      const contract = makeContract({ endsAt: new Date('2026-06-20T00:00:00Z') });
      contract.activate();

      expect(contract.isExpiringWithin(30, new Date('2026-06-01T00:00:00Z'))).toBe(true);
    });

    it('is false for a Draft contract, however close its end date', () => {
      const contract = makeContract({ endsAt: new Date('2026-06-02T00:00:00Z') });

      expect(contract.isExpiringWithin(30, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    });

    it('is false once the contract has already lapsed', () => {
      const contract = makeContract({ endsAt: new Date('2026-05-01T00:00:00Z') });
      contract.activate();

      expect(contract.isExpiringWithin(30, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    });
  });

  describe('applyEdits', () => {
    it('applies changes and re-runs the creation invariants', () => {
      const contract = makeContract();
      contract.applyEdits({ planName: 'Platinum', amount: 250 });

      expect(contract.planName).toBe('Platinum');
      expect(contract.amount).toBe(250);
    });

    it('refuses an edit that would invert the term', () => {
      const contract = makeContract();

      expect(() => contract.applyEdits({ endsAt: new Date('2025-01-01') })).toThrow(
        /cannot end before it starts/
      );
      // And leaves the contract untouched.
      expect(contract.endsAt).toEqual(new Date('2026-12-31'));
    });

    it('can clear the assigned user explicitly without touching other fields', () => {
      const contract = makeContract({ assignedUserId: 'user-9' });
      contract.applyEdits({ assignedUserId: null });

      expect(contract.assignedUserId).toBeNull();
      expect(contract.planName).toBe('Gold');
    });
  });

  it('exposes derived fields through toJSON', () => {
    const contract = makeContract();
    const json = contract.toJSON();

    expect(json).toHaveProperty('daysUntilExpiry');
    expect(json.planName).toBe('Gold');
  });
});
