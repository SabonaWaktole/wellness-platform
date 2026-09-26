import { ContractPayment, PaymentStatus } from './ContractPayment';

function makePayment(overrides: Partial<Parameters<typeof ContractPayment.create>[0]> = {}) {
  return ContractPayment.create({
    id: 'p1',
    tenantId: 'tenant-1',
    contractId: 'c1',
    periodIndex: 1,
    dueDate: new Date('2026-03-01'),
    amount: 100,
    ...overrides,
  });
}

describe('ContractPayment', () => {
  it('starts unpaid and owing the full amount', () => {
    const payment = makePayment();

    expect(payment.status).toBe(PaymentStatus.Unpaid);
    expect(payment.outstanding).toBe(100);
  });

  describe('recordPayment', () => {
    it('settles in full when no amount is given', () => {
      const payment = makePayment();
      payment.recordPayment({});

      expect(payment.status).toBe(PaymentStatus.Paid);
      expect(payment.paidAmount).toBe(100);
      expect(payment.outstanding).toBe(0);
      expect(payment.paidAt).toBeInstanceOf(Date);
    });

    it('records a smaller amount as PARTIAL', () => {
      const payment = makePayment();
      payment.recordPayment({ amount: 40 });

      expect(payment.status).toBe(PaymentStatus.Partial);
      expect(payment.outstanding).toBe(60);
    });

    it('accumulates instalments rather than overwriting them', () => {
      const payment = makePayment();
      payment.recordPayment({ amount: 40 });
      payment.recordPayment({ amount: 60 });

      expect(payment.paidAmount).toBe(100);
      expect(payment.status).toBe(PaymentStatus.Paid);
    });

    it('settles a repayment split into thirds despite floating point', () => {
      const payment = makePayment();
      payment.recordPayment({ amount: 33.33 });
      payment.recordPayment({ amount: 33.33 });
      payment.recordPayment({ amount: 33.34 });

      expect(payment.status).toBe(PaymentStatus.Paid);
      expect(payment.outstanding).toBe(0);
    });

    it('refuses a zero or negative payment', () => {
      const payment = makePayment();

      expect(() => payment.recordPayment({ amount: 0 })).toThrow(/positive amount/);
      expect(() => payment.recordPayment({ amount: -5 })).toThrow(/positive amount/);
    });

    it('keeps the method and note it was given', () => {
      const payment = makePayment();
      payment.recordPayment({ method: 'bank transfer', note: 'ref 8891' });

      expect(payment.method).toBe('bank transfer');
      expect(payment.note).toBe('ref 8891');
    });
  });

  it('resets everything on markUnpaid', () => {
    const payment = makePayment();
    payment.recordPayment({});
    payment.markUnpaid();

    expect(payment.status).toBe(PaymentStatus.Unpaid);
    expect(payment.paidAmount).toBe(0);
    expect(payment.paidAt).toBeNull();
    expect(payment.outstanding).toBe(100);
  });

  it('owes nothing once waived, even with no money recorded', () => {
    const payment = makePayment();
    payment.waive('goodwill month');

    expect(payment.status).toBe(PaymentStatus.Waived);
    expect(payment.outstanding).toBe(0);
    expect(payment.note).toBe('goodwill month');
  });

  describe('isOverdue', () => {
    it('is true when money is still owed after the due date', () => {
      const payment = makePayment({ dueDate: new Date('2026-03-01') });

      expect(payment.isOverdue(new Date('2026-04-01'))).toBe(true);
    });

    it('is false once settled', () => {
      const payment = makePayment({ dueDate: new Date('2026-03-01') });
      payment.recordPayment({});

      expect(payment.isOverdue(new Date('2026-04-01'))).toBe(false);
    });

    it('is false for a waived instalment', () => {
      const payment = makePayment({ dueDate: new Date('2026-03-01') });
      payment.waive();

      expect(payment.isOverdue(new Date('2026-04-01'))).toBe(false);
    });
  });

  describe('applyEdits', () => {
    it('re-derives the status when the amount changes', () => {
      const payment = makePayment();
      payment.recordPayment({});
      expect(payment.status).toBe(PaymentStatus.Paid);

      // Price corrected upward: what was settled no longer covers it.
      payment.applyEdits({ amount: 150 });
      expect(payment.status).toBe(PaymentStatus.Partial);
      expect(payment.outstanding).toBe(50);
    });

    it('leaves a waived instalment waived', () => {
      const payment = makePayment();
      payment.waive();
      payment.applyEdits({ amount: 500 });

      expect(payment.status).toBe(PaymentStatus.Waived);
      expect(payment.outstanding).toBe(0);
    });

    it('refuses a negative amount', () => {
      const payment = makePayment();

      expect(() => payment.applyEdits({ amount: -1 })).toThrow(/non-negative/);
    });
  });
});
