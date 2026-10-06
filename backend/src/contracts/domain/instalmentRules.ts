import { DomainError } from '@shared/domain/errors/DomainError';
import { Money } from '../../pricing/domain/Money';
import { PaymentStatus } from './ContractPayment';
import { addDays, daysBetween } from './calendarDay';

/**
 * The instalment status rules of SRS §4.2 as pure functions on `Money`
 * (FR-PAY-06, 07, 09). Each returns the new values and changes nothing; the
 * use cases (Slice 8) persist them with the history row and the audit entry.
 *
 * They work on `InstalmentState` rather than on the `ContractPayment` class,
 * which still holds `number` amounts until Slice 4 converts the columns.
 *
 * Dates are workspace days (see calendarDay.ts); `today` is the workspace day.
 */

export class PaymentRuleError extends DomainError {}

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const isPaymentMethod = (value: string): value is PaymentMethod =>
  (PAYMENT_METHODS as readonly string[]).includes(value);

export interface InstalmentState {
  amount: Money;
  paidAmount: Money;
  status: PaymentStatus;
  dueDate: Date;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
}

/** What is still owed. A waived instalment owes nothing, whatever was received. */
export function outstanding(instalment: Pick<InstalmentState, 'amount' | 'paidAmount' | 'status'>): Money {
  if (instalment.status === PaymentStatus.Waived) return Money.zero();
  const owed = instalment.amount.subtract(instalment.paidAmount);
  return owed.isNegative() ? Money.zero() : owed;
}

/** Statuses a person may never choose: money sets the first two, the daily job the third. */
const NEVER_CHOSEN: readonly PaymentStatus[] = [
  PaymentStatus.PartiallyPaid,
  PaymentStatus.Paid,
  PaymentStatus.Overdue,
  PaymentStatus.Waived,
];

/** Statuses a correction can go back to, in the order an instalment passes through them. */
const CORRECTABLE: readonly PaymentStatus[] = [
  PaymentStatus.NotInvoiced,
  PaymentStatus.InvoiceIssued,
  PaymentStatus.PaymentPending,
];

export const canChooseStatus = (status: PaymentStatus): boolean => !NEVER_CHOSEN.includes(status);

/** Overdue sits after Payment Pending: it is a pending invoice that has gone past due. */
const rank = (status: PaymentStatus): number =>
  status === PaymentStatus.Overdue ? CORRECTABLE.length : CORRECTABLE.indexOf(status);

const requireText = (value: string | null | undefined, message: string): string => {
  const text = value?.trim();
  if (!text) throw new PaymentRuleError(message);
  return text;
};

/** NOT_INVOICED -> INVOICE_ISSUED. Needs the invoice number and date (FR-PAY-06). */
export function markInvoiced(
  instalment: InstalmentState,
  invoiceNumber: string,
  invoiceDate: Date
): { status: PaymentStatus; invoiceNumber: string; invoiceDate: Date } {
  const number = requireText(invoiceNumber, 'An invoice number is required');
  if (Number.isNaN(invoiceDate?.getTime())) throw new PaymentRuleError('An invoice date is required');
  if (instalment.status !== PaymentStatus.NotInvoiced) {
    throw new PaymentRuleError(`An instalment that is ${instalment.status} cannot be invoiced`);
  }
  return { status: PaymentStatus.InvoiceIssued, invoiceNumber: number, invoiceDate };
}

/** INVOICE_ISSUED -> PAYMENT_PENDING. Needs an invoice (FR-PAY-06). */
export function markPending(instalment: InstalmentState): { status: PaymentStatus } {
  if (instalment.status !== PaymentStatus.InvoiceIssued || !instalment.invoiceNumber) {
    throw new PaymentRuleError('Only an instalment with an issued invoice can be marked payment pending');
  }
  return { status: PaymentStatus.PaymentPending };
}

/**
 * Put an instalment back to an earlier status, with a comment (FR-PAY-06).
 * Only while nothing is received (use `reverseReceipt` otherwise, D6), only
 * backwards, and never to Paid, Partially Paid or Overdue. Going back to
 * Not Invoiced drops the invoice.
 */
export function correct(
  instalment: InstalmentState,
  toStatus: PaymentStatus,
  comment: string
): { status: PaymentStatus; invoiceNumber: string | null; invoiceDate: Date | null } {
  requireText(comment, 'A comment is required to correct a status');
  if (!canChooseStatus(toStatus) || !CORRECTABLE.includes(toStatus)) {
    throw new PaymentRuleError(`An instalment cannot be set to ${toStatus} by hand`);
  }
  if (!instalment.paidAmount.isZero()) {
    throw new PaymentRuleError('Money has been received: reverse the receipt instead');
  }
  const current = rank(instalment.status);
  if (current < 0 || rank(toStatus) >= current) {
    throw new PaymentRuleError(`An instalment that is ${instalment.status} cannot be corrected to ${toStatus}`);
  }
  if (toStatus === PaymentStatus.NotInvoiced) {
    return { status: toStatus, invoiceNumber: null, invoiceDate: null };
  }
  return { status: toStatus, invoiceNumber: instalment.invoiceNumber, invoiceDate: instalment.invoiceDate };
}

/**
 * Add a receipt (FR-PAY-07). The amount must be positive, the date not in the
 * future, the method known, and the total must not exceed the instalment.
 * The status follows from the amounts: Paid at the full amount, otherwise
 * Partially Paid. An Overdue instalment moves the same way.
 */
export function recordReceipt(
  instalment: InstalmentState,
  amount: Money,
  receivedOn: Date,
  method: string,
  today: Date
): { paidAmount: Money; status: PaymentStatus; paidAt: Date; method: PaymentMethod } {
  if (!amount.isPositive()) throw new PaymentRuleError('A receipt must be a positive amount');
  if (Number.isNaN(receivedOn?.getTime())) throw new PaymentRuleError('The date received is required');
  if (daysBetween(today, receivedOn) > 0) throw new PaymentRuleError('The date received cannot be in the future');
  if (!isPaymentMethod(method)) throw new PaymentRuleError('The payment method is required');
  if (amount.isGreaterThan(outstanding(instalment))) {
    throw new PaymentRuleError('A receipt cannot exceed the amount still outstanding');
  }

  const paidAmount = instalment.paidAmount.add(amount);
  return {
    paidAmount,
    status: paidAmount.equals(instalment.amount) ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid,
    paidAt: receivedOn,
    method,
  };
}

/**
 * Take money back off an instalment: a receipt recorded against the wrong
 * month, or a transfer that bounced (D6). Needs a comment. The status is
 * derived again from what is left: Partially Paid, or, with nothing left,
 * Payment Pending if it was invoiced and Not Invoiced if it was not.
 */
export function reverseReceipt(
  instalment: InstalmentState,
  amount: Money,
  comment: string
): { paidAmount: Money; status: PaymentStatus } {
  requireText(comment, 'A comment is required to reverse a receipt');
  if (!amount.isPositive()) throw new PaymentRuleError('The amount to reverse must be positive');
  if (amount.isGreaterThan(instalment.paidAmount)) {
    throw new PaymentRuleError('Cannot reverse more than has been received');
  }

  const paidAmount = instalment.paidAmount.subtract(amount);
  if (!paidAmount.isZero()) return { paidAmount, status: PaymentStatus.PartiallyPaid };
  return {
    paidAmount,
    status: instalment.invoiceNumber ? PaymentStatus.PaymentPending : PaymentStatus.NotInvoiced,
  };
}

const OVERDUE_CANDIDATES: readonly PaymentStatus[] = [
  PaymentStatus.InvoiceIssued,
  PaymentStatus.PaymentPending,
  PaymentStatus.PartiallyPaid,
];

/**
 * Should the daily job set this instalment to Overdue? Only an invoiced or
 * part-paid instalment, once its due date plus the grace days is behind us
 * (FR-PAY-09). Paid, Waived, Not Invoiced and already Overdue instalments
 * never qualify.
 */
export function overdueOn(instalment: InstalmentState, today: Date, graceDays: number): boolean {
  if (!OVERDUE_CANDIDATES.includes(instalment.status)) return false;
  return daysBetween(addDays(instalment.dueDate, graceDays), today) > 0;
}

/** Past its due date and still Not Invoiced: keeps its status, shows a flag (FR-PAY-09). */
export function dueNotInvoiced(instalment: InstalmentState, today: Date): boolean {
  return instalment.status === PaymentStatus.NotInvoiced && daysBetween(instalment.dueDate, today) > 0;
}
