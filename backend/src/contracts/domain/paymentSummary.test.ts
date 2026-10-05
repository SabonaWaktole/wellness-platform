import { Money } from '../../pricing/domain/Money';
import { PaymentStatus } from './ContractPayment';
import { summarise, SummarisedInstalment } from './paymentSummary';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (value: string | number) => Money.of(value);

const row = (dueDate: string, status: PaymentStatus, paid = '0'): SummarisedInstalment => ({
  amount: m('49.40'),
  paidAmount: m(status === PaymentStatus.Paid ? '49.40' : paid),
  status,
  dueDate: day(dueDate),
});

describe('summarise', () => {
  it('FR-PAY-10: 12 x €49.40 with 3 paid is total €592.80, received €148.20, outstanding €444.60', () => {
    const rows = [
      ...[0, 1, 2].map((i) => row(`2027-0${i + 3}-01`, PaymentStatus.Paid)),
      ...Array.from({ length: 9 }, (_, i) =>
        row(i < 6 ? `2027-0${i + 6}-01` : `2027-${i + 6}-01`, PaymentStatus.NotInvoiced)
      ),
    ];
    const summary = summarise(rows, day('2027-05-15'));
    expect(rows).toHaveLength(12);
    expect(summary.total.toString()).toBe('592.80');
    expect(summary.received.toString()).toBe('148.20');
    expect(summary.outstanding.toString()).toBe('444.60');
    expect(summary.overdueCount).toBe(0);
    expect(summary.overdueAmount.toString()).toBe('0.00');
  });

  it('FR-PAY-10: next due date is the earliest unpaid one from today on', () => {
    const rows = [
      row('2027-03-01', PaymentStatus.Paid),
      row('2027-04-01', PaymentStatus.Overdue),
      row('2027-05-01', PaymentStatus.InvoiceIssued),
      row('2027-06-01', PaymentStatus.NotInvoiced),
    ];
    expect(summarise(rows, day('2027-05-01')).nextDueDate).toEqual(day('2027-05-01'));
    expect(summarise(rows, day('2027-05-02')).nextDueDate).toEqual(day('2027-06-01'));
    expect(summarise(rows, day('2027-07-01')).nextDueDate).toBeNull();
  });

  it('FR-PAY-10: counts overdue instalments and what is still owed on them', () => {
    const rows = [
      row('2027-03-01', PaymentStatus.Overdue),
      row('2027-04-01', PaymentStatus.Overdue, '20.00'),
      row('2027-05-01', PaymentStatus.PaymentPending),
    ];
    const summary = summarise(rows, day('2027-04-15'));
    expect(summary.overdueCount).toBe(2);
    expect(summary.overdueAmount.toString()).toBe('78.80');
    expect(summary.received.toString()).toBe('20.00');
  });

  it('FR-PAY-10: a waived instalment is neither total nor outstanding', () => {
    const summary = summarise([row('2027-03-01', PaymentStatus.Waived), row('2027-04-01', PaymentStatus.NotInvoiced)], day('2027-03-01'));
    expect(summary.total.toString()).toBe('49.40');
    expect(summary.outstanding.toString()).toBe('49.40');
  });

  it('FR-PAY-10: no instalments gives zeros and no next date', () => {
    const summary = summarise([], day('2027-03-01'));
    expect(summary.total.toString()).toBe('0.00');
    expect(summary.nextDueDate).toBeNull();
  });

  it('NFR-ACC-03: sums are exact over many cents-level amounts', () => {
    const rows = Array.from({ length: 10 }, () => ({
      amount: m('0.10'),
      paidAmount: m('0.00'),
      status: PaymentStatus.PaymentPending,
      dueDate: day('2027-03-01'),
    }));
    expect(summarise(rows, day('2027-03-01')).total.toString()).toBe('1.00');
    expect(summarise([...rows.slice(0, 3)], day('2027-03-01')).total.toString()).toBe('0.30');
  });
});
