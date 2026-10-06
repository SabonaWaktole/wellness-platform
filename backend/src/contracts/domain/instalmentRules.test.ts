import { Money } from '../../pricing/domain/Money';
import { PaymentStatus } from './ContractPayment';
import {
  InstalmentState,
  canChooseStatus,
  correct,
  dueNotInvoiced,
  markInvoiced,
  markPending,
  outstanding,
  overdueOn,
  recordReceipt,
  reverseReceipt,
} from './instalmentRules';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (value: string | number) => Money.of(value);

const instalment = (overrides: Partial<InstalmentState> = {}): InstalmentState => ({
  amount: m('49.40'),
  paidAmount: m(0),
  status: PaymentStatus.PaymentPending,
  dueDate: day('2027-03-01'),
  invoiceNumber: 'INV-1',
  invoiceDate: day('2027-02-20'),
  ...overrides,
});

describe('recordReceipt', () => {
  const today = day('2027-03-10');

  it('FR-PAY-07: €20.00 on €49.40 is Partially Paid with €29.40 outstanding', () => {
    const result = recordReceipt(instalment(), m('20.00'), day('2027-03-10'), 'BANK_TRANSFER', today);
    expect(result.status).toBe(PaymentStatus.PartiallyPaid);
    expect(result.paidAmount.toString()).toBe('20.00');
    expect(outstanding({ ...instalment(), ...result }).toString()).toBe('29.40');
  });

  it('FR-PAY-07: a second receipt of €29.40 gives Paid', () => {
    const first = instalment({ paidAmount: m('20.00'), status: PaymentStatus.PartiallyPaid });
    const result = recordReceipt(first, m('29.40'), day('2027-03-10'), 'CASH', today);
    expect(result.status).toBe(PaymentStatus.Paid);
    expect(result.paidAmount.toString()).toBe('49.40');
    expect(result.paidAt).toEqual(day('2027-03-10'));
  });

  it('FR-PAY-07: a further €1.00 on a Paid instalment is refused', () => {
    const paid = instalment({ paidAmount: m('49.40'), status: PaymentStatus.Paid });
    expect(() => recordReceipt(paid, m('1.00'), day('2027-03-10'), 'CASH', today)).toThrow(/outstanding/);
  });

  it('FR-PAY-07: a receipt above the outstanding amount is refused', () => {
    expect(() => recordReceipt(instalment(), m('49.41'), day('2027-03-10'), 'CASH', today)).toThrow();
  });

  it('FR-PAY-07: the full amount in one go is Paid', () => {
    expect(recordReceipt(instalment(), m('49.40'), day('2027-03-10'), 'CARD', today).status).toBe(PaymentStatus.Paid);
  });

  it('FR-PAY-07: a future date is refused, today is fine', () => {
    expect(() => recordReceipt(instalment(), m('10'), day('2027-03-11'), 'CASH', today)).toThrow(/future/);
    expect(() => recordReceipt(instalment(), m('10'), day('2027-03-10'), 'CASH', today)).not.toThrow();
  });

  it.each(['0', '-5.00'])('FR-PAY-07: refuses an amount of %s', (amount) => {
    expect(() => recordReceipt(instalment(), m(amount), day('2027-03-10'), 'CASH', today)).toThrow(/positive/);
  });

  it.each(['', 'CHEQUE', 'bank_transfer'])('FR-PAY-07: refuses the method "%s"', (method) => {
    expect(() => recordReceipt(instalment(), m('10'), day('2027-03-10'), method, today)).toThrow(/method/);
  });

  it('FR-PAY-07: a receipt on an Overdue instalment moves it back to Partially Paid or Paid', () => {
    const overdue = instalment({ status: PaymentStatus.Overdue });
    expect(recordReceipt(overdue, m('10'), day('2027-03-10'), 'CASH', today).status).toBe(PaymentStatus.PartiallyPaid);
    expect(recordReceipt(overdue, m('49.40'), day('2027-03-10'), 'CASH', today).status).toBe(PaymentStatus.Paid);
  });

  it.each([
    ['0.10 + 0.20 against 0.30', '0.30', ['0.10', '0.20']],
    ['33.33 + 33.33 + 33.34 against 100.00', '100.00', ['33.33', '33.33', '33.34']],
    ['49.40 in 4 receipts', '49.40', ['12.35', '12.35', '12.35', '12.35']],
  ])('NFR-ACC-03, FR-PAY-07: %s settles as Paid with no float drift', (_title, amount, receipts) => {
    let state = instalment({ amount: m(amount) });
    for (const receipt of receipts) {
      const next = recordReceipt(state, m(receipt), day('2027-03-10'), 'CASH', today);
      state = { ...state, paidAmount: next.paidAmount, status: next.status };
    }
    expect(state.status).toBe(PaymentStatus.Paid);
    expect(state.paidAmount.toString()).toBe(amount);
  });

  it('FR-PAY-07: does not change the instalment it is given', () => {
    const before = instalment();
    recordReceipt(before, m('20'), day('2027-03-10'), 'CASH', today);
    expect(before.paidAmount.toString()).toBe('0.00');
    expect(before.status).toBe(PaymentStatus.PaymentPending);
  });
});

describe('reverseReceipt', () => {
  const partly = instalment({ paidAmount: m('20.00'), status: PaymentStatus.PartiallyPaid });

  it('FR-PAY-06: reversing part of a receipt stays Partially Paid', () => {
    const result = reverseReceipt(partly, m('5.00'), 'wrong month');
    expect(result.paidAmount.toString()).toBe('15.00');
    expect(result.status).toBe(PaymentStatus.PartiallyPaid);
  });

  it('FR-PAY-06: reversing everything goes back to Payment Pending when invoiced, Not Invoiced when not', () => {
    expect(reverseReceipt(partly, m('20.00'), 'bounced').status).toBe(PaymentStatus.PaymentPending);
    expect(reverseReceipt({ ...partly, invoiceNumber: null }, m('20.00'), 'bounced').status).toBe(
      PaymentStatus.NotInvoiced
    );
  });

  it('FR-PAY-06: reversing a Paid instalment makes it Partially Paid again', () => {
    const paid = instalment({ paidAmount: m('49.40'), status: PaymentStatus.Paid });
    expect(reverseReceipt(paid, m('29.40'), 'wrong month').status).toBe(PaymentStatus.PartiallyPaid);
  });

  it('FR-PAY-06: needs a comment, a positive amount, and no more than was received', () => {
    expect(() => reverseReceipt(partly, m('5'), '  ')).toThrow(/comment/);
    expect(() => reverseReceipt(partly, m('0'), 'x')).toThrow(/positive/);
    expect(() => reverseReceipt(partly, m('20.01'), 'x')).toThrow(/more than/);
  });
});

describe('instalment status rules', () => {
  const notInvoiced = instalment({ status: PaymentStatus.NotInvoiced, invoiceNumber: null, invoiceDate: null });

  it('FR-PAY-06: Invoice Issued needs a number and a date', () => {
    expect(markInvoiced(notInvoiced, 'INV-1', day('2027-02-20'))).toEqual({
      status: PaymentStatus.InvoiceIssued,
      invoiceNumber: 'INV-1',
      invoiceDate: day('2027-02-20'),
    });
    expect(() => markInvoiced(notInvoiced, '  ', day('2027-02-20'))).toThrow(/number/);
    expect(() => markInvoiced(notInvoiced, 'INV-1', new Date('nope'))).toThrow(/date/);
  });

  it('FR-PAY-06: only a Not Invoiced instalment can be invoiced', () => {
    expect(() => markInvoiced(instalment(), 'INV-2', day('2027-02-20'))).toThrow();
  });

  it('FR-PAY-06: Payment Pending needs an invoice', () => {
    const issued = instalment({ status: PaymentStatus.InvoiceIssued });
    expect(markPending(issued).status).toBe(PaymentStatus.PaymentPending);
    expect(() => markPending(notInvoiced)).toThrow(/invoice/);
    expect(() => markPending({ ...issued, invoiceNumber: null })).toThrow(/invoice/);
  });

  it.each([
    [PaymentStatus.PartiallyPaid, false],
    [PaymentStatus.Paid, false],
    [PaymentStatus.Overdue, false],
    [PaymentStatus.Waived, false],
    [PaymentStatus.NotInvoiced, true],
    [PaymentStatus.InvoiceIssued, true],
    [PaymentStatus.PaymentPending, true],
  ])('FR-PAY-06: %s can be chosen by hand = %s', (status, chosen) => {
    expect(canChooseStatus(status)).toBe(chosen);
  });

  it.each([PaymentStatus.Paid, PaymentStatus.PartiallyPaid, PaymentStatus.Overdue])(
    'FR-PAY-06: a correction can never set %s',
    (status) => {
      expect(() => correct(instalment(), status, 'because')).toThrow();
    }
  );

  it('FR-PAY-06: a correction goes back to an earlier status, with a comment', () => {
    expect(correct(instalment(), PaymentStatus.InvoiceIssued, 'sent too early').status).toBe(
      PaymentStatus.InvoiceIssued
    );
    expect(correct(instalment({ status: PaymentStatus.Overdue }), PaymentStatus.PaymentPending, 'paid late').status).toBe(
      PaymentStatus.PaymentPending
    );
    expect(() => correct(instalment(), PaymentStatus.InvoiceIssued, '')).toThrow(/comment/);
  });

  it('FR-PAY-06: going back to Not Invoiced drops the invoice', () => {
    expect(correct(instalment(), PaymentStatus.NotInvoiced, 'wrong client')).toEqual({
      status: PaymentStatus.NotInvoiced,
      invoiceNumber: null,
      invoiceDate: null,
    });
  });

  it('FR-PAY-06: a correction only goes backwards, and not when money was received', () => {
    expect(() => correct(instalment(), PaymentStatus.PaymentPending, 'same')).toThrow();
    expect(() => correct(notInvoiced, PaymentStatus.InvoiceIssued, 'forwards')).toThrow();
    const partly = instalment({ paidAmount: m('20'), status: PaymentStatus.PartiallyPaid });
    expect(() => correct(partly, PaymentStatus.NotInvoiced, 'x')).toThrow(/reverse/);
  });
});

describe('overdue rule', () => {
  const due = instalment({ dueDate: day('2027-03-01') });
  const dayAfter = day('2027-03-02');

  it('FR-PAY-09: due yesterday and Payment Pending is overdue', () => {
    expect(overdueOn(due, dayAfter, 0)).toBe(true);
  });

  it('FR-PAY-09: due today is not overdue yet', () => {
    expect(overdueOn(due, day('2027-03-01'), 0)).toBe(false);
  });

  it.each([PaymentStatus.InvoiceIssued, PaymentStatus.PaymentPending, PaymentStatus.PartiallyPaid])(
    'FR-PAY-09: %s past due is a candidate',
    (status) => {
      expect(overdueOn(instalment({ status }), dayAfter, 0)).toBe(true);
    }
  );

  it.each([PaymentStatus.NotInvoiced, PaymentStatus.Paid, PaymentStatus.Waived, PaymentStatus.Overdue])(
    'FR-PAY-09: %s is never set to overdue by the job',
    (status) => {
      expect(overdueOn(instalment({ status }), day('2028-01-01'), 0)).toBe(false);
    }
  );

  it('FR-PAY-09: grace days of 3 move the day: due 1 March, overdue from 5 March', () => {
    expect(overdueOn(due, day('2027-03-04'), 3)).toBe(false);
    expect(overdueOn(due, day('2027-03-05'), 3)).toBe(true);
  });

  it('FR-PAY-09: Not Invoiced past due is only flagged "Due, not invoiced"', () => {
    const notInvoiced = instalment({ status: PaymentStatus.NotInvoiced });
    expect(dueNotInvoiced(notInvoiced, dayAfter)).toBe(true);
    expect(dueNotInvoiced(notInvoiced, day('2027-03-01'))).toBe(false);
    expect(dueNotInvoiced(due, dayAfter)).toBe(false);
  });
});

describe('outstanding', () => {
  it('NFR-ACC-03: is amount minus received, never below zero, nothing for a waived instalment', () => {
    expect(outstanding(instalment({ paidAmount: m('20.00') })).toString()).toBe('29.40');
    expect(outstanding(instalment({ paidAmount: m('60.00') })).toString()).toBe('0.00');
    expect(outstanding(instalment({ status: PaymentStatus.Waived })).toString()).toBe('0.00');
  });
});
