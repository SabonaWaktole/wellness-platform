import { BillingPeriod, Contract, ContractEditRefusedError, ContractStatus } from './Contract';
import { ContractValidationError } from './contractErrors';

const NO_DOCUMENT_NEEDED = { documentRequired: false, hasSignedDocument: false };
const activate = (contract: Contract) => contract.changeStatus(ContractStatus.Active, NO_DOCUMENT_NEEDED);

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
      activate(contract);

      expect(contract.status).toBe(ContractStatus.Active);
      expect(contract.activatedAt).toBeInstanceOf(Date);
    });

    it('refuses to activate twice', () => {
      const contract = makeContract();
      activate(contract);

      expect(() => activate(contract)).toThrow(ContractValidationError);
    });

    it('expires only an Active contract', () => {
      const draft = makeContract();
      expect(() => draft.expire()).toThrow(/Invalid state transition/);

      const active = makeContract();
      activate(active);
      active.expire();
      expect(active.status).toBe(ContractStatus.Expired);
    });

    it('FR-CON-15 cancels from Draft and from Active with a reason, but not from a terminal state', () => {
      const draft = makeContract();
      draft.changeStatus(ContractStatus.Cancelled, { ...NO_DOCUMENT_NEEDED, reason: 'Client changed their mind' });
      expect(draft.status).toBe(ContractStatus.Cancelled);
      expect(draft.cancelledAt).toBeInstanceOf(Date);
      expect(draft.cancelReason).toBe('Client changed their mind');

      const active = makeContract();
      activate(active);
      active.changeStatus(ContractStatus.Cancelled, { ...NO_DOCUMENT_NEEDED, reason: 'Closed down' });
      expect(active.status).toBe(ContractStatus.Cancelled);

      expect(() => active.changeStatus(ContractStatus.Cancelled, { ...NO_DOCUMENT_NEEDED, reason: 'Again' })).toThrow(ContractValidationError);
    });

    it('FR-CON-15 refuses to cancel without a reason', () => {
      const contract = makeContract();
      expect(() => contract.changeStatus(ContractStatus.Cancelled, NO_DOCUMENT_NEEDED)).toThrow(/reason is required/);
      expect(() => contract.changeStatus(ContractStatus.Cancelled, { ...NO_DOCUMENT_NEEDED, reason: '   ' })).toThrow(/reason is required/);
      expect(contract.status).toBe(ContractStatus.Draft);
    });

    it('FR-CON-12 marks pending signature with a start, end, billing period and price, and locks the values', () => {
      const contract = makeContract();
      contract.changeStatus(ContractStatus.PendingSignature, NO_DOCUMENT_NEEDED);
      expect(contract.status).toBe(ContractStatus.PendingSignature);
      expect(contract.lockedAt).toBeInstanceOf(Date);
    });

    it.each([
      ['an end date', { endsAt: new Date('nope') }, 'endsAt'],
      ['a start date', { startsAt: new Date('nope') }, 'startsAt'],
      ['a price', { amount: 0 }, 'amount'],
    ])('FR-CON-12 a Draft without %s cannot be marked pending signature', (_label, overrides, field) => {
      const contract = makeContract(overrides as any);
      expect(() => contract.changeStatus(ContractStatus.PendingSignature, NO_DOCUMENT_NEEDED)).toThrow(
        expect.objectContaining({ field })
      );
      expect(contract.status).toBe(ContractStatus.Draft);
      expect(contract.lockedAt).toBeNull();
    });

    it('FR-CON-13 activation needs the signed document where the workspace requires one', () => {
      const contract = makeContract();
      expect(() => contract.changeStatus(ContractStatus.Active, { documentRequired: true, hasSignedDocument: false })).toThrow(
        expect.objectContaining({ field: 'document' })
      );
      expect(contract.status).toBe(ContractStatus.Draft);

      contract.changeStatus(ContractStatus.Active, { documentRequired: true, hasSignedDocument: true });
      expect(contract.status).toBe(ContractStatus.Active);
      expect(contract.activatedAt).toBeInstanceOf(Date);
      expect(contract.lockedAt).toBeInstanceOf(Date);
    });

    it('FR-CON-14 suspends and reinstates with a reason, stored on the contract, and reinstating needs no document', () => {
      const contract = makeContract();
      contract.changeStatus(ContractStatus.Active, { documentRequired: true, hasSignedDocument: true });
      expect(() => contract.changeStatus(ContractStatus.Suspended, { documentRequired: true, hasSignedDocument: true })).toThrow(/reason is required/);

      contract.changeStatus(ContractStatus.Suspended, { documentRequired: true, hasSignedDocument: true, reason: 'Unpaid invoices' });
      expect(contract.status).toBe(ContractStatus.Suspended);
      expect(contract.suspendedAt).toBeInstanceOf(Date);
      expect(contract.suspensionReason).toBe('Unpaid invoices');

      expect(() => contract.changeStatus(ContractStatus.Active, { documentRequired: true, hasSignedDocument: false })).toThrow(/reason is required/);
      contract.changeStatus(ContractStatus.Active, { documentRequired: true, hasSignedDocument: false, reason: 'Paid in full' });
      expect(contract.status).toBe(ContractStatus.Active);
      expect(contract.suspendedAt).toBeNull();
      expect(contract.suspensionReason).toBeNull();
    });

    it('FR-CON-11 a person cannot expire a contract', () => {
      const contract = makeContract();
      activate(contract);
      expect(() => contract.changeStatus(ContractStatus.Expired, NO_DOCUMENT_NEEDED)).toThrow(/expires on its own/);
    });
  });

  describe('renewal eligibility', () => {
    it('allows renewal only from a terminal state', () => {
      const draft = makeContract();
      expect(draft.canRenew()).toBe(false);

      const active = makeContract();
      activate(active);
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
      activate(contract);

      expect(contract.isExpiringWithin(30, new Date('2026-06-01T00:00:00Z'))).toBe(true);
    });

    it('is false for a Draft contract, however close its end date', () => {
      const contract = makeContract({ endsAt: new Date('2026-06-02T00:00:00Z') });

      expect(contract.isExpiringWithin(30, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    });

    it('is false once the contract has already lapsed', () => {
      const contract = makeContract({ endsAt: new Date('2026-05-01T00:00:00Z') });
      activate(contract);

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

describe('Contract made from a deal (M3 Slice 4)', () => {
  const fromDeal = (overrides: Partial<Parameters<typeof Contract.create>[0]> = {}) =>
    makeContract({ dealId: 'deal-1', number: 'CTR-2026-0001', amount: 49.4, agreedAnnualValue: '592.80', ...overrides });

  const source = {
    dealId: 'deal-1',
    quotationId: 'offer-2',
    packageId: 'pkg-2',
    servicesSnapshot: [{ nameSq: 'Vizitë', nameEn: 'Visit', descriptionSq: null, descriptionEn: null }],
    termsText: null,
    amount: '60.00',
    agreedAnnualValue: '720.00',
    discountPercent: '5.00',
  };

  it('FR-CON-02 a contract without a deal is Legacy, one with a deal is not', () => {
    expect(makeContract().isLegacy).toBe(true);
    expect(makeContract().toJSON().legacy).toBe(true);
    expect(fromDeal().isLegacy).toBe(false);
  });

  it('NFR-ACC-03 serialises the price as a two-decimal string', () => {
    expect(fromDeal().toJSON().amount).toBe('49.40');
    expect(makeContract({ amount: 100 }).toJSON().amount).toBe('100.00');
  });

  it('FR-CON-04 the price and the plan cannot be edited on a contract from a deal', () => {
    const contract = fromDeal();
    expect(() => contract.applyEdits({ amount: 1 })).toThrow(ContractEditRefusedError);
    expect(() => contract.applyEdits({ planName: 'Other' })).toThrow(ContractEditRefusedError);
    expect(contract.amount).toBe(49.4);
  });

  it('FR-CON-04 refresh re-reads the agreed values while Draft', () => {
    const contract = fromDeal();
    contract.refreshFromDeal(source);
    expect(contract).toMatchObject({ amount: 60, agreedAnnualValue: '720.00', discountPercent: '5.00', quotationId: 'offer-2', packageId: 'pkg-2' });
  });

  it.each([ContractStatus.PendingSignature, ContractStatus.Active, ContractStatus.Cancelled])(
    'FR-CON-04 refresh is refused from %s on',
    (status) => {
      const contract = fromDeal({ status });
      expect(() => contract.refreshFromDeal(source)).toThrow(/locked/);
      expect(contract.amount).toBe(49.4);
    }
  );

  it('FR-CON-04 a Legacy contract cannot be refreshed', () => {
    expect(() => makeContract().refreshFromDeal(source)).toThrow(ContractEditRefusedError);
  });

  it('FR-CON-10 a Draft\'s dates, billing period, renewal date, notes and salesperson are editable', () => {
    const contract = fromDeal();
    contract.applyEdits({
      startsAt: new Date('2026-02-01'),
      endsAt: new Date('2027-01-31'),
      billingPeriod: BillingPeriod.Quarterly,
      renewalDate: new Date('2026-12-01'),
      notes: 'n',
      assignedUserId: 'user-2',
    });
    expect(contract).toMatchObject({ billingPeriod: BillingPeriod.Quarterly, notes: 'n', assignedUserId: 'user-2' });
    expect(contract.endsAt).toEqual(new Date('2027-01-31'));
    expect(contract.renewalDate).toEqual(new Date('2026-12-01'));
  });

  it('FR-CON-10 after activation only notes and the renewal date change; a changed end date says to renew', () => {
    const contract = fromDeal({ status: ContractStatus.Active });
    expect(() => contract.applyEdits({ endsAt: new Date('2028-01-01') })).toThrow(/renew/i);
    expect(() => contract.applyEdits({ billingPeriod: BillingPeriod.Annual })).toThrow(ContractEditRefusedError);
    // The same values sent back are not a change.
    contract.applyEdits({ endsAt: new Date('2026-12-31'), startsAt: new Date('2026-01-01'), billingPeriod: BillingPeriod.Monthly, notes: 'ok', renewalDate: new Date('2026-11-01') });
    expect(contract.notes).toBe('ok');
    expect(contract.renewalDate).toEqual(new Date('2026-11-01'));
  });

  it('FR-CON-10 a Legacy contract keeps the old edit rules', () => {
    const contract = makeContract({ status: ContractStatus.Active });
    contract.applyEdits({ amount: 120, endsAt: new Date('2027-06-30') });
    expect(contract.amount).toBe(120);
  });
});
