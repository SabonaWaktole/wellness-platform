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
  amount: number;
  status: PaymentStatus;
  paidAmount: number;
  paidAt: Date | null;
  method: string | null;
  note: string | null;
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
      status: props.status ?? PaymentStatus.PaymentPending,
      paidAmount,
      paidAt: props.paidAt ?? null,
      method: props.method ?? null,
      note: props.note ?? null,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
    });
  }

  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      contractId: this.contractId,
      periodIndex: this.periodIndex,
      dueDate: this.dueDate,
      amount: this.amount,
      status: this.status,
      paidAmount: this.paidAmount,
      outstanding: this.outstanding,
      paidAt: this.paidAt,
      method: this.method,
      note: this.note,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * What is still owed. WAIVED owes nothing regardless of `paidAmount` — the
   * business gave the month away, so it must not show up in an arrears total.
   */
  get outstanding(): number {
    if (this.status === PaymentStatus.Waived) return 0;
    return Math.max(0, this.amount - this.paidAmount);
  }

  /** Unpaid or part-paid, and the due date has gone by. */
  isOverdue(now: Date = new Date()): boolean {
    return this.outstanding > 0 && this.dueDate.getTime() < now.getTime();
  }

  /**
   * Record money against this instalment.
   *
   * Passing no `amount` means "paid in full", which is the overwhelmingly
   * common case — someone ticking a month off a list should not have to retype
   * a figure that is already on the row. A smaller amount lands as PARTIAL, and
   * an amount that clears the balance lands as PAID even if it arrived in two
   * goes, because `paidAmount` accumulates rather than overwrites.
   */
  recordPayment(input: { amount?: number; paidAt?: Date; method?: string | null; note?: string | null }): void {
    const received = input.amount ?? this.outstanding;
    if (!Number.isFinite(received) || received <= 0) {
      throw new Error('A recorded payment must be a positive amount');
    }

    this.paidAmount = Number((this.paidAmount + received).toFixed(2));
    this.paidAt = input.paidAt ?? new Date();
    if (input.method !== undefined) this.method = input.method;
    if (input.note !== undefined) this.note = input.note;

    // Floating point: a schedule of 100.00 paid as 33.33 + 33.33 + 33.34 must
    // settle as PAID, so the comparison is on cents rather than on an exact
    // equality that binary doubles cannot promise.
    this.status = this.paidAmount + 0.005 >= this.amount ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid;
    this.updatedAt = new Date();
  }

  /**
   * Undo — the payment was recorded against the wrong month, or the transfer
   * bounced. Returns the row to PAYMENT_PENDING rather than deleting it: the instalment
   * is still owed, and the schedule would be missing a month without it.
   */
  markUnpaid(): void {
    this.status = PaymentStatus.PaymentPending;
    this.paidAmount = 0;
    this.paidAt = null;
    this.updatedAt = new Date();
  }

  waive(note?: string | null): void {
    this.status = PaymentStatus.Waived;
    if (note !== undefined) this.note = note;
    this.updatedAt = new Date();
  }

  applyEdits(edits: { dueDate?: Date; amount?: number; method?: string | null; note?: string | null }): void {
    if (edits.amount !== undefined) {
      if (!Number.isFinite(edits.amount) || edits.amount < 0) {
        throw new Error('Payment amount must be a non-negative number');
      }
      this.amount = edits.amount;
      // An amount change can settle or unsettle the row, so the status is
      // re-derived rather than left describing the old figure. WAIVED is left
      // alone: it is a decision, not a calculation.
      if (this.status !== PaymentStatus.Waived) {
        if (this.paidAmount <= 0) this.status = PaymentStatus.PaymentPending;
        else this.status = this.paidAmount + 0.005 >= this.amount ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid;
      }
    }
    if (edits.dueDate !== undefined) this.dueDate = edits.dueDate;
    if (edits.method !== undefined) this.method = edits.method;
    if (edits.note !== undefined) this.note = edits.note;
    this.updatedAt = new Date();
  }
}
