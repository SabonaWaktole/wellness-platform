import { Money } from '../../pricing/domain/Money';
import { ContractPayment, PaymentStatus } from './ContractPayment';

function makePayment(overrides: Partial<Parameters<typeof ContractPayment.create>[0]> = {}) {
  return ContractPayment.create({
    id: 'p1',
    tenantId: 'tenant-1',
    contractId: 'c1',
    periodIndex: 1,
    dueDate: new Date('2026-03-01'),
    amount: 49.4,
    ...overrides,
  });
}

describe('ContractPayment', () => {
  it('FR-PAY-02 starts Not Invoiced, with nothing received and the full amount outstanding', () => {
    const payment = makePayment();

    expect(payment.status).toBe(PaymentStatus.NotInvoiced);
    expect(payment.paidAmount).toBe(0);
    expect(payment.outstanding).toBe(49.4);
    expect(payment.invoiceNumber).toBeNull();
  });

  it('refuses a negative amount', () => {
    expect(() => makePayment({ amount: -1 })).toThrow('non-negative');
  });

  it('NFR-ACC-03 sends money as two-decimal strings', () => {
    const json = makePayment({ paidAmount: 20, status: PaymentStatus.PartiallyPaid }).toJSON();

    expect(json.amount).toBe('49.40');
    expect(json.paidAmount).toBe('20.00');
    expect(json.outstanding).toBe('29.40');
  });

  it('a waived instalment owes nothing, whatever was received', () => {
    expect(makePayment({ status: PaymentStatus.Waived }).outstanding).toBe(0);
  });

  describe('state and apply', () => {
    it('hands the rules Money and takes their result back', () => {
      const payment = makePayment({ paidAmount: 20, status: PaymentStatus.PartiallyPaid });
      expect(payment.state().amount.toString()).toBe('49.40');
      expect(payment.state().paidAmount.toString()).toBe('20.00');

      payment.apply({ paidAmount: Money.of('49.40'), status: PaymentStatus.Paid, paidAt: new Date('2026-03-10') });

      expect(payment.status).toBe(PaymentStatus.Paid);
      expect(payment.paidAmount).toBe(49.4);
      expect(payment.outstanding).toBe(0);
      expect(payment.paidAt).toEqual(new Date('2026-03-10'));
    });

    it('changes only what it is given', () => {
      const payment = makePayment({ note: 'keep', invoiceNumber: 'INV-1' });
      payment.apply({ dueDate: new Date('2026-04-01') });

      expect(payment.dueDate).toEqual(new Date('2026-04-01'));
      expect(payment.note).toBe('keep');
      expect(payment.invoiceNumber).toBe('INV-1');
    });
  });
});
