import { Money } from '../../pricing/domain/Money';
// Type only: instalmentRules.ts imports this file, so a value import here would be circular.
import type { InstalmentState } from './instalmentRules';

/**
 * The state of one expected payment, as asserted by a person.
 *
 * Nothing in this module observes a real payment — there is no gateway, no
 * webhook, no reconciliation. Someone collected the money and is recording
 * that fact, so every value here is a claim a user made and can correct.
 *
 * WAIVED is not PAID with a zero amount: it means the business decided not to
 * collect this instalment (a goodwill month, a negotiated discount), and it
 * must not count toward revenue the way a real payment does. It is also the
 * one legacy key (SRS decision D6, Slice 10) with no equivalent in the SRS
 * set: existing rows keep it, but it is neither offered for a new payment
 * nor configurable from Settings → Statuses.
 *
 * NOT_INVOICED and INVOICE_ISSUED are groundwork (FR-SET-08): nothing in
 * Milestone 1 assigns them, the same way `ContractStatus.PendingSignature`
 * and `.Suspended` are groundwork with no transition into them yet.
 */
export enum PaymentStatus {
  NotInvoiced = 'NOT_INVOICED',
  InvoiceIssued = 'INVOICE_ISSUED',
  PaymentPending = 'PAYMENT_PENDING',
  PartiallyPaid = 'PARTIALLY_PAID',
  Paid = 'PAID',
  Overdue = 'OVERDUE',
  /** @deprecated Legacy key (D6). Existing rows only; never assigned to a new payment. */
  Waived = 'WAIVED',
}

export const isPaymentStatus = (value: string): value is PaymentStatus =>
  Object.values(PaymentStatus).includes(value as PaymentStatus);

export class ContractPayment {
  id: string;
  tenantId: string;
  contractId: string;
  periodIndex: number;
  dueDate: Date;
  /** Still a `number` here; the rules in instalmentRules.ts work on `Money` (see `state`). */
  amount: number;
  status: PaymentStatus;
  paidAmount: number;
  /** The date of the last receipt. */
  paidAt: Date | null;
  method: string | null;
  note: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  createdAt: Date;
  updatedAt: Date;

  private constructor(props: {
    id: string;
    tenantId: string;
    contractId: string;
    periodIndex: number;
    dueDate: Date;
    amount: number;
    status: PaymentStatus;
    paidAmount: number;
    paidAt: Date | null;
    method: string | null;
    note: string | null;
    invoiceNumber: string | null;
    invoiceDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.contractId = props.contractId;
    this.periodIndex = props.periodIndex;
    this.dueDate = props.dueDate;
    this.amount = props.amount;
    this.status = props.status;
    this.paidAmount = props.paidAmount;
    this.paidAt = props.paidAt;
    this.method = props.method;
    this.note = props.note;
    this.invoiceNumber = props.invoiceNumber;
    this.invoiceDate = props.invoiceDate;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    id: string;
    tenantId: string;
    contractId: string;
    periodIndex: number;
    dueDate: Date;
    amount: number;
    status?: PaymentStatus;
    paidAmount?: number;
    paidAt?: Date | null;
    method?: string | null;
    note?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): ContractPayment {
    if (!Number.isFinite(props.amount) || props.amount < 0) {
      throw new Error('Payment amount must be a non-negative number');
    }

    const paidAmount = props.paidAmount ?? 0;
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new Error('Paid amount must be a non-negative number');
    }

    return new ContractPayment({
      id: props.id,
      tenantId: props.tenantId,
      contractId: props.contractId,
      periodIndex: props.periodIndex,
      dueDate: props.dueDate,
      amount: props.amount,
      // A new instalment starts Not Invoiced (FR-PAY-02); only a stored row says otherwise.
      status: props.status ?? PaymentStatus.NotInvoiced,
      paidAmount,
      paidAt: props.paidAt ?? null,
      method: props.method ?? null,
      note: props.note ?? null,
      invoiceNumber: props.invoiceNumber ?? null,
      invoiceDate: props.invoiceDate ?? null,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    });
  }

  /**
   * The instalment as the API sends it: money as two-decimal strings, never
   * numbers (NFR-ACC-03). `dueNotInvoiced` needs the workspace day, so the
   * presenter adds it.
   */
  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      contractId: this.contractId,
      periodIndex: this.periodIndex,
      dueDate: this.dueDate,
      amount: this.state().amount.toString(),
      status: this.status,
      paidAmount: this.state().paidAmount.toString(),
      outstanding: this.owed().toString(),
      paidAt: this.paidAt,
      method: this.method,
      note: this.note,
      invoiceNumber: this.invoiceNumber,
      invoiceDate: this.invoiceDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /** The values the instalment rules work on (see instalmentRules.ts). */
  state(): InstalmentState {
    return {
      amount: Money.of(this.amount),
      paidAmount: Money.of(this.paidAmount),
      status: this.status,
      dueDate: this.dueDate,
      invoiceNumber: this.invoiceNumber,
      invoiceDate: this.invoiceDate,
    };
  }

  /** The same figure as `outstanding` in instalmentRules.ts, without importing it (circular). */
  private owed(): Money {
    if (this.status === PaymentStatus.Waived) return Money.zero();
    const left = Money.of(this.amount).subtract(Money.of(this.paidAmount));
    return left.isNegative() ? Money.zero() : left;
  }

  /** What is still owed. */
  get outstanding(): number {
    return Number(this.owed().toString());
  }

  /** Takes over the result of a rule. Whoever calls it saves the instalment and writes the history. */
  apply(changes: {
    status?: PaymentStatus;
    paidAmount?: Money;
    paidAt?: Date | null;
    method?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: Date | null;
    dueDate?: Date;
    amount?: Money;
    note?: string | null;
  }): void {
    if (changes.status !== undefined) this.status = changes.status;
    if (changes.paidAmount !== undefined) this.paidAmount = Number(changes.paidAmount.toString());
    if (changes.paidAt !== undefined) this.paidAt = changes.paidAt;
    if (changes.method !== undefined) this.method = changes.method;
    if (changes.invoiceNumber !== undefined) this.invoiceNumber = changes.invoiceNumber;
    if (changes.invoiceDate !== undefined) this.invoiceDate = changes.invoiceDate;
    if (changes.dueDate !== undefined) this.dueDate = changes.dueDate;
    if (changes.amount !== undefined) this.amount = Number(changes.amount.toString());
    if (changes.note !== undefined) this.note = changes.note;
    this.updatedAt = new Date();
  }
}
