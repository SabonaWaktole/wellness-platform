import { daysBetween } from './calendarDay';

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
  // Groundwork only (FR-SET-07, Slice 10): no transition assigns PendingSignature
  // or Suspended in Milestone 1. They exist so the label set is complete and
  // configurable now; the transitions into them are Milestone 3.
  PendingSignature = 'PENDING_SIGNATURE',
  Active = 'ACTIVE',
  Suspended = 'SUSPENDED',
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

  /** Validity on a workspace day (FR-CON-20). A thin wrapper over `contractValidityOn`. */
  validityOn(today: Date, expiringSoonDays: number): ContractValidity {
    return contractValidityOn(this, today, expiringSoonDays);
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

/**
 * Who may cause a transition. `system` is the daily expiry job: nobody acts,
 * time passes (FR-CON-16).
 */
export type ContractTransitionActor = 'contracts.manage' | 'contracts.terminate' | 'system';

export interface ContractTransition {
  from: ContractStatus;
  to: ContractStatus;
  /** The permission the acting user needs (FR-CON-11, FR-RBAC-19). */
  permission: ContractTransitionActor;
  reasonRequired: boolean;
}

const S = ContractStatus;

/**
 * The allowed status transitions, and only these (SRS §3.2, FR-CON-11).
 * Expired and Cancelled are final: a client moves forward through a renewal,
 * which is a new contract. A Draft is cancelled with `contracts.manage`; once
 * it has gone out for signature, cancelling needs `contracts.terminate`.
 */
export const CONTRACT_TRANSITIONS: readonly ContractTransition[] = [
  { from: S.Draft, to: S.PendingSignature, permission: 'contracts.manage', reasonRequired: false },
  { from: S.Draft, to: S.Active, permission: 'contracts.manage', reasonRequired: false },
  { from: S.PendingSignature, to: S.Active, permission: 'contracts.manage', reasonRequired: false },
  { from: S.Active, to: S.Suspended, permission: 'contracts.terminate', reasonRequired: true },
  { from: S.Suspended, to: S.Active, permission: 'contracts.terminate', reasonRequired: true },
  { from: S.Active, to: S.Expired, permission: 'system', reasonRequired: false },
  { from: S.Draft, to: S.Cancelled, permission: 'contracts.manage', reasonRequired: true },
  { from: S.PendingSignature, to: S.Cancelled, permission: 'contracts.terminate', reasonRequired: true },
  { from: S.Active, to: S.Cancelled, permission: 'contracts.terminate', reasonRequired: true },
  { from: S.Suspended, to: S.Cancelled, permission: 'contracts.terminate', reasonRequired: true },
];

/** The rule for one move, or `undefined` when it is not allowed. */
export const findContractTransition = (from: ContractStatus, to: ContractStatus): ContractTransition | undefined =>
  CONTRACT_TRANSITIONS.find((t) => t.from === from && t.to === to);

export const canTransition = (from: ContractStatus, to: ContractStatus): boolean =>
  findContractTransition(from, to) !== undefined;

/** Why a contract is not valid today. `null` when it is valid (FR-CON-20). */
export type ContractInvalidReason =
  | 'NOT_STARTED'
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface ContractValidity {
  valid: boolean;
  reason: ContractInvalidReason | null;
  /** Valid and ending within the expiring-soon window (FR-REN-04). */
  expiringSoon: boolean;
  /** Whole days from today to the end date, today counted as 0; negative once past. */
  daysLeft: number;
}

/**
 * The one validity rule (FR-CON-20): a contract is valid when it is Active and
 * today is between its start and end date, both included. Everything else is
 * not valid, with the status as the reason, or NOT_STARTED for an Active
 * contract whose start is still ahead. An Active contract past its end date
 * reads EXPIRED even before the daily job has recorded it, so Reception never
 * sees a stale "valid".
 *
 * Search, the company page and the list all call this and nothing else.
 * `today` is the workspace day, as a date (see calendarDay.ts).
 */
export function contractValidityOn(
  contract: { status: ContractStatus; startsAt: Date; endsAt: Date },
  today: Date,
  expiringSoonDays: number
): ContractValidity {
  const daysLeft = daysBetween(today, contract.endsAt);
  const notInvalid = (reason: ContractInvalidReason): ContractValidity => ({
    valid: false,
    reason,
    expiringSoon: false,
    daysLeft,
  });

  switch (contract.status) {
    case ContractStatus.Draft:
      return notInvalid('DRAFT');
    case ContractStatus.PendingSignature:
      return notInvalid('PENDING_SIGNATURE');
    case ContractStatus.Suspended:
      return notInvalid('SUSPENDED');
    case ContractStatus.Expired:
      return notInvalid('EXPIRED');
    case ContractStatus.Cancelled:
      return notInvalid('CANCELLED');
    case ContractStatus.Active:
      break;
  }

  if (daysBetween(contract.startsAt, today) < 0) return notInvalid('NOT_STARTED');
  if (daysLeft < 0) return notInvalid('EXPIRED');

  return { valid: true, reason: null, expiringSoon: daysLeft <= expiringSoonDays, daysLeft };
}
