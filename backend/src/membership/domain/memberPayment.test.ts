import { formatReceiptNumber, InvalidPaymentError, paymentMethod, receivedOnDate, voidReason } from './memberPayment';

describe('memberPayment rules', () => {
  it('FR-MPAY-05: a receipt number is prefix, year and six digits, and the prefix is a setting', () => {
    expect(formatReceiptNumber('RCP', 2027, 45)).toBe('RCP-2027-000045');
    expect(formatReceiptNumber('REC', 2028, 1)).toBe('REC-2028-000001');
  });

  it('FR-MPAY-01: the date received is a real day and not in the future', () => {
    expect(receivedOnDate('2027-03-15', '2027-03-15')).toBe('2027-03-15');
    expect(() => receivedOnDate('2027-03-16', '2027-03-15')).toThrow(InvalidPaymentError);
    expect(() => receivedOnDate('2027-02-30', '2027-03-15')).toThrow(InvalidPaymentError);
    expect(() => receivedOnDate(undefined, '2027-03-15')).toThrow(InvalidPaymentError);
  });

  it('FR-MPAY-01: the method is cash, bank transfer, card or other', () => {
    expect(paymentMethod('BANK_TRANSFER')).toBe('BANK_TRANSFER');
    expect(() => paymentMethod('CHEQUE')).toThrow(InvalidPaymentError);
  });

  it('FR-MPAY-06: a void needs a reason', () => {
    expect(voidReason('  Entered twice ')).toBe('Entered twice');
    expect(() => voidReason('   ')).toThrow(InvalidPaymentError);
    expect(() => voidReason(undefined)).toThrow(InvalidPaymentError);
  });
});
