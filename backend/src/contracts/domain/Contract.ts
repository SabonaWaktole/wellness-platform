/**
 * How often a contract's `amount` falls due.
 *
 * `ONE_TIME` is not a period at all — it is the escape hatch for a term that
 * is paid once up front, and it generates exactly one payment row rather than
 * a schedule. Modelling it here rather than as a nullable billingPeriod keeps
 * every read site free of a "no period means once" special case.
 */
export enum BillingPeriod {
  Monthly = 'MONTHLY',
  Quarterly = 'QUARTERLY',
  Annual = 'ANNUAL',
  OneTime = 'ONE_TIME',
}

/** Months covered by one instalment. `ONE_TIME` covers the whole term. */
export const MONTHS_PER_PERIOD: Record<BillingPeriod, number> = {
  [BillingPeriod.Monthly]: 1,
  [BillingPeriod.Quarterly]: 3,
  [BillingPeriod.Annual]: 12,
  [BillingPeriod.OneTime]: 0,
};

export const isBillingPeriod = (value: string): value is BillingPeriod =>
  Object.values(BillingPeriod).includes(value as BillingPeriod);

/**
 * The lifecycle of one contract TERM.
 *
 * Deliberately has no PAID/UNPAID value: whether money arrived is a property
 * of the individual ContractPayment rows, not of the term. A contract can be
 * ACTIVE with three unpaid instalments, and collapsing those two axes into one
 * status is exactly what makes "which month is outstanding" unanswerable.
 *
 * EXPIRED and CANCELLED are both terminal, and they mean different things:
 * EXPIRED is time running out on a term that ran its course, CANCELLED is
 * somebody ending it early. Only a renewal moves a client forward from either,
 * and it does so by creating a new term rather than reopening this one.
 */
export enum ContractStatus {
  Draft = 'DRAFT',
  Active = 'ACTIVE',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

export class Contract {
  id: string;
  tenantId: string;
  clientId: string;
  assignedUserId: string | null;
  planName: string;
  status: ContractStatus;
  amount: number;
  billingPeriod: BillingPeriod;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  documentUrl: string | null;
  documentName: string | null;
  renewedFromContractId: string | null;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  expiryNotifiedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;

  /**
   * Display name of the client, hydrated from the joined Client row on read.
   * Same convention as `Invoice.clientName` — not persisted from here.
   */
  clientName?: string;

  /**
   * The company's responsible salesperson, hydrated from the joined Client
   * row on read and never persisted from here. Data scope reads it: a
   * contract belongs to whoever its company belongs to (FR-RBAC-11).
   * `undefined` when the caller did not join the client.
   */
  clientAssignedUserId?: string | null;

  /**
   * Rollup of this contract's payment rows, hydrated on read where the
   * repository joined them. Undefined means "not loaded", which is not the
   * same as "no payments" — list views that skip the join must not render a
   * contract as fully unpaid just because they did not ask.
   */
  paymentSummary?: {
    total: number;
    paid: number;
    outstanding: number;
    unpaidCount: number;
    overdueCount: number;
  };

  private constructor(props: {
    id: string;
    tenantId: string;
    clientId: string;
    assignedUserId: string | null;
    planName: string;
    status: ContractStatus;
    amount: number;
    billingPeriod: BillingPeriod;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
    documentUrl: string | null;
    documentName: string | null;
    renewedFromContractId: string | null;
    activatedAt: Date | null;
    cancelledAt: Date | null;
    expiryNotifiedAt: Date | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    clientName?: string;
    clientAssignedUserId?: string | null;
    paymentSummary?: Contract['paymentSummary'];
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientId = props.clientId;
    this.assignedUserId = props.assignedUserId;
    this.planName = props.planName;
    this.status = props.status;
    this.amount = props.amount;
    this.billingPeriod = props.billingPeriod;
    this.startsAt = props.startsAt;
    this.endsAt = props.endsAt;
    this.notes = props.notes;
    this.documentUrl = props.documentUrl;
    this.documentName = props.documentName;
    this.renewedFromContractId = props.renewedFromContractId;
    this.activatedAt = props.activatedAt;
    this.cancelledAt = props.cancelledAt;
    this.expiryNotifiedAt = props.expiryNotifiedAt;
    this.createdByUserId = props.createdByUserId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.clientName = props.clientName;
    this.clientAssignedUserId = props.clientAssignedUserId;
    this.paymentSummary = props.paymentSummary;
  }

  static create(props: {
    id: string;
    tenantId: string;
    clientId: string;
    planName: string;
    amount: number;
    billingPeriod: BillingPeriod;
    startsAt: Date;
    endsAt: Date;
    createdByUserId: string;
    assignedUserId?: string | null;
    status?: ContractStatus;
    notes?: string | null;
    documentUrl?: string | null;
    documentName?: string | null;
    renewedFromContractId?: string | null;
    activatedAt?: Date | null;
    cancelledAt?: Date | null;
    expiryNotifiedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    clientName?: string;
    clientAssignedUserId?: string | null;
    paymentSummary?: Contract['paymentSummary'];
  }): Contract {
    const planName = props.planName?.trim();
    if (!planName) {
      throw new Error('A contract must name the plan being sold');
    }

    if (!Number.isFinite(props.amount) || props.amount < 0) {
      throw new Error('Contract amount must be a non-negative number');
    }

    // A term that ends before it starts would generate an empty payment
    // schedule and never reach the expiry sweep, so it is refused here rather
    // than left to surface as a mystery later. Equal dates are allowed: a
    // single-day term is unusual but not incoherent.
    if (props.endsAt.getTime() < props.startsAt.getTime()) {
      throw new Error('A contract cannot end before it starts');
    }

    return new Contract({
      id: props.id,
      tenantId: props.tenantId,
      clientId: props.clientId,
      assignedUserId: props.assignedUserId ?? null,
      planName,
      status: props.status ?? ContractStatus.Draft,
      amount: props.amount,
      billingPeriod: props.billingPeriod,
      startsAt: props.startsAt,
      endsAt: props.endsAt,
      notes: props.notes ?? null,
      documentUrl: props.documentUrl ?? null,
      documentName: props.documentName ?? null,
      renewedFromContractId: props.renewedFromContractId ?? null,
      activatedAt: props.activatedAt ?? null,
      cancelledAt: props.cancelledAt ?? null,
      expiryNotifiedAt: props.expiryNotifiedAt ?? null,
      createdByUserId: props.createdByUserId,
      createdAt: props.createdAt ?? new Date(),
      updatedAt: props.updatedAt ?? new Date(),
      clientName: props.clientName,
      clientAssignedUserId: props.clientAssignedUserId,
      paymentSummary: props.paymentSummary,
    });
  }

  /**
   * Explicit serialization for the HTTP layer — same reason `Invoice.toJSON`
   * exists: `isExpiringWithin` and friends are methods, and the derived fields
   * the UI needs would silently vanish from `res.json(contract)` without this.
   */
  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      clientId: this.clientId,
      clientName: this.clientName,
      assignedUserId: this.assignedUserId,
      planName: this.planName,
      status: this.status,
      amount: this.amount,
      billingPeriod: this.billingPeriod,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      notes: this.notes,
      documentUrl: this.documentUrl,
      documentName: this.documentName,
      renewedFromContractId: this.renewedFromContractId,
      activatedAt: this.activatedAt,
      cancelledAt: this.cancelledAt,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      paymentSummary: this.paymentSummary,
      daysUntilExpiry: this.daysUntilExpiry(),
    };
  }

  /**
   * Whole days from `now` until the term ends. Negative once it has lapsed.
   *
   * Computed on UTC day boundaries rather than on raw milliseconds so that a
   * contract ending tomorrow at 09:00 reads as "1 day", not "0 days" — the
   * question the UI is asking is about the calendar, not about elapsed time.
   */
  daysUntilExpiry(now: Date = new Date()): number {
    const day = 24 * 60 * 60 * 1000;
    const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.round((startOfDay(this.endsAt) - startOfDay(now)) / day);
  }

  /** Active and ending within `days`. The "expires soon" sweep's predicate. */
  isExpiringWithin(days: number, now: Date = new Date()): boolean {
    if (this.status !== ContractStatus.Active) return false;
    const remaining = this.daysUntilExpiry(now);
    return remaining >= 0 && remaining <= days;
  }

  activate(): void {
    if (this.status !== ContractStatus.Draft) {
      throw new Error(`Invalid state transition from ${this.status} to Active`);
    }
    this.status = ContractStatus.Active;
    this.activatedAt = new Date();
  }

  /**
   * System-only transition, mirroring `Invoice.markOverdue()` — no acting
   * user, because a term ending is time passing rather than anyone's action.
   *
   * Only an Active contract can expire. A Draft one was never in force, and
   * Expired/Cancelled are already terminal.
   */
  expire(): void {
    if (this.status !== ContractStatus.Active) {
      throw new Error(`Invalid state transition from ${this.status} to Expired`);
    }
    this.status = ContractStatus.Expired;
  }

  /**
   * Ending a term early. Allowed from Draft too — abandoning a contract that
   * was drawn up but never signed is a real thing that happens, and deleting
   * the row instead would lose the fact that it was ever quoted.
   */
  cancel(): void {
    if (this.status !== ContractStatus.Draft && this.status !== ContractStatus.Active) {
      throw new Error(`Invalid state transition from ${this.status} to Cancelled`);
    }
    this.status = ContractStatus.Cancelled;
    this.cancelledAt = new Date();
  }

  /**
   * Can a new term be created from this one?
   *
   * Only terminal contracts renew. Renewing a still-Active term would create
   * two overlapping live contracts for the same client and leave "what are
   * they on right now" ambiguous — end the current one first (it will expire
   * on its own at `endsAt`), then renew.
   */
  canRenew(): boolean {
    return this.status === ContractStatus.Expired || this.status === ContractStatus.Cancelled;
  }

  /** Fields a user may edit directly. Status is NOT among them by design. */
  applyEdits(edits: {
    planName?: string;
    amount?: number;
    billingPeriod?: BillingPeriod;
    startsAt?: Date;
    endsAt?: Date;
    assignedUserId?: string | null;
    notes?: string | null;
  }): void {
    const next = {
      planName: edits.planName ?? this.planName,
      amount: edits.amount ?? this.amount,
      startsAt: edits.startsAt ?? this.startsAt,
      endsAt: edits.endsAt ?? this.endsAt,
    };

    // Re-run the constructor's invariants rather than restating them: an edit
    // that blanks the plan name or inverts the dates is exactly as invalid as
    // a create that does.
    Contract.create({
      id: this.id,
      tenantId: this.tenantId,
      clientId: this.clientId,
      createdByUserId: this.createdByUserId,
      billingPeriod: edits.billingPeriod ?? this.billingPeriod,
      ...next,
    });

    this.planName = next.planName.trim();
    this.amount = next.amount;
    this.startsAt = next.startsAt;
    this.endsAt = next.endsAt;
    if (edits.billingPeriod !== undefined) this.billingPeriod = edits.billingPeriod;
    if (edits.assignedUserId !== undefined) this.assignedUserId = edits.assignedUserId;
    if (edits.notes !== undefined) this.notes = edits.notes;
    this.updatedAt = new Date();
  }

  attachDocument(url: string, name: string): void {
    this.documentUrl = url;
    this.documentName = name;
    this.updatedAt = new Date();
  }

  clearDocument(): void {
    this.documentUrl = null;
    this.documentName = null;
    this.updatedAt = new Date();
  }
}
