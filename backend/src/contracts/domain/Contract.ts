import { Money } from '../../pricing/domain/Money';
import { daysBetween } from './calendarDay';
import { ContractValidationError } from './contractErrors';

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

/** A service of the contract's package, copied from the offer so the contract reads the same later (FR-CON-03, 04). */
export interface ContractServiceLine {
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
}

/** The offer's terms as rich-text documents, one per language (M2 D10). */
export interface ContractTerms {
  sq: Record<string, unknown> | null;
  en: Record<string, unknown> | null;
}

/** What a won deal and its offer hand to a contract (FR-CON-03). Read by the use case, never typed by the caller (FR-CON-04). */
export interface ContractDealSource {
  dealId: string;
  quotationId: string;
  packageId: string | null;
  servicesSnapshot: ContractServiceLine[];
  termsText: ContractTerms | null;
  /** Agreed monthly price, a two-decimal string. */
  amount: string;
  agreedAnnualValue: string;
  discountPercent: string | null;
}

/** Raised when an edit is not allowed on a contract in its state (FR-CON-04, FR-CON-10). Mapped to 400. */
export class ContractEditRefusedError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = 'ContractEditRefusedError';
  }
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
   * M3 Slice 4 (D1): the won deal and offer this contract was made from, the
   * package and services it sold, its terms, the agreed annual value and
   * discount, its number and the date a renewal should be agreed. All null on
   * a Legacy contract (no deal). Money is a two-decimal string (NFR-ACC-03).
   */
  dealId: string | null;
  quotationId: string | null;
  packageId: string | null;
  servicesSnapshot: ContractServiceLine[] | null;
  termsText: ContractTerms | null;
  agreedAnnualValue: string | null;
  discountPercent: string | null;
  number: string | null;
  renewalDate: Date | null;
  lockedAt: Date | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  cancelReason: string | null;
  notRenewingReasonId: string | null;
  notRenewingNote: string | null;
  /** Hydrated on read from the joined package, and the deal's and offer's references. */
  packageName?: string | null;
  dealTitle?: string | null;
  quotationReference?: string | null;

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
    dealId: string | null;
    quotationId: string | null;
    packageId: string | null;
    servicesSnapshot: ContractServiceLine[] | null;
    termsText: ContractTerms | null;
    agreedAnnualValue: string | null;
    discountPercent: string | null;
    number: string | null;
    renewalDate: Date | null;
    lockedAt: Date | null;
    suspendedAt: Date | null;
    suspensionReason: string | null;
    cancelReason: string | null;
    notRenewingReasonId: string | null;
    notRenewingNote: string | null;
    packageName?: string | null;
    dealTitle?: string | null;
    quotationReference?: string | null;
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
    this.dealId = props.dealId;
    this.quotationId = props.quotationId;
    this.packageId = props.packageId;
    this.servicesSnapshot = props.servicesSnapshot;
    this.termsText = props.termsText;
    this.agreedAnnualValue = props.agreedAnnualValue;
    this.discountPercent = props.discountPercent;
    this.number = props.number;
    this.renewalDate = props.renewalDate;
    this.lockedAt = props.lockedAt;
    this.suspendedAt = props.suspendedAt;
    this.suspensionReason = props.suspensionReason;
    this.cancelReason = props.cancelReason;
    this.notRenewingReasonId = props.notRenewingReasonId;
    this.notRenewingNote = props.notRenewingNote;
    this.packageName = props.packageName;
    this.dealTitle = props.dealTitle;
    this.quotationReference = props.quotationReference;
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
    dealId?: string | null;
    quotationId?: string | null;
    packageId?: string | null;
    servicesSnapshot?: ContractServiceLine[] | null;
    termsText?: ContractTerms | null;
    agreedAnnualValue?: string | null;
    discountPercent?: string | null;
    number?: string | null;
    renewalDate?: Date | null;
    lockedAt?: Date | null;
    suspendedAt?: Date | null;
    suspensionReason?: string | null;
    cancelReason?: string | null;
    notRenewingReasonId?: string | null;
    notRenewingNote?: string | null;
    packageName?: string | null;
    dealTitle?: string | null;
    quotationReference?: string | null;
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
      dealId: props.dealId ?? null,
      quotationId: props.quotationId ?? null,
      packageId: props.packageId ?? null,
      servicesSnapshot: props.servicesSnapshot ?? null,
      termsText: props.termsText ?? null,
      agreedAnnualValue: props.agreedAnnualValue ?? null,
      discountPercent: props.discountPercent ?? null,
      number: props.number ?? null,
      renewalDate: props.renewalDate ?? null,
      lockedAt: props.lockedAt ?? null,
      suspendedAt: props.suspendedAt ?? null,
      suspensionReason: props.suspensionReason ?? null,
      cancelReason: props.cancelReason ?? null,
      notRenewingReasonId: props.notRenewingReasonId ?? null,
      notRenewingNote: props.notRenewingNote ?? null,
      packageName: props.packageName,
      dealTitle: props.dealTitle,
      quotationReference: props.quotationReference,
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
      // Money goes out as a two-decimal string (NFR-ACC-03): the frontend only formats it.
      amount: Money.of(this.amount).toString(),
      billingPeriod: this.billingPeriod,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      notes: this.notes,
      number: this.number,
      /** True for a contract made before contracts needed a won deal (FR-CON-02). */
      legacy: this.isLegacy,
      dealId: this.dealId,
      dealTitle: this.dealTitle ?? null,
      quotationId: this.quotationId,
      quotationReference: this.quotationReference ?? null,
      packageId: this.packageId,
      packageName: this.packageName ?? null,
      servicesSnapshot: this.servicesSnapshot,
      termsText: this.termsText,
      agreedAnnualValue: this.agreedAnnualValue,
      discountPercent: this.discountPercent,
      renewalDate: this.renewalDate ? this.renewalDate.toISOString().slice(0, 10) : null,
      suspendedAt: this.suspendedAt,
      suspensionReason: this.suspensionReason,
      cancelReason: this.cancelReason,
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

  /** No deal: made before contracts needed a won deal (FR-CON-02). */
  get isLegacy(): boolean {
    return this.dealId === null;
  }

  /**
   * "Refresh from deal" (FR-CON-04): re-reads the agreed price, annual value,
   * discount, package, services, offer and terms from the deal's won offer.
   * Only while the contract is a Draft; from Pending Signature on they are
   * locked.
   */
  refreshFromDeal(source: ContractDealSource): void {
    if (this.isLegacy) {
      throw new ContractEditRefusedError('A contract without a deal cannot be refreshed from a deal.');
    }
    if (this.status !== ContractStatus.Draft) {
      throw new ContractEditRefusedError('The agreed values are locked once the contract has gone out for signature.');
    }
    this.amount = Number(Money.of(source.amount).toString());
    this.agreedAnnualValue = Money.of(source.agreedAnnualValue).toString();
    this.discountPercent = source.discountPercent;
    this.quotationId = source.quotationId;
    this.packageId = source.packageId;
    this.servicesSnapshot = source.servicesSnapshot;
    this.termsText = source.termsText;
    this.updatedAt = new Date();
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

  /**
   * The one way a person moves a contract between statuses (FR-CON-11..15).
   * The transition must be in the table, a reason is stored where the table
   * asks for one, and the target's own conditions hold:
   *
   * - Pending Signature needs a start date, an end date, a billing period and
   *   a price, and locks the commercial values (FR-CON-12);
   * - Active needs the signed document where the workspace requires one
   *   (FR-CON-13, `documentRequired`);
   * - Suspended and Cancelled keep their reason on the contract (FR-CON-14, 15).
   *
   * Expired is the daily job's (`expire()`). Which permission the person needs
   * for the move is the use case's to check, from the same table.
   */
  changeStatus(
    to: ContractStatus,
    options: { reason?: string | null; documentRequired: boolean; hasSignedDocument: boolean; now?: Date }
  ): { from: ContractStatus; reason: string | null } {
    const from = this.status;
    const transition = findContractTransition(from, to);
    if (!transition) {
      throw new ContractValidationError('status', `A contract cannot go from ${from} to ${to}.`);
    }
    if (transition.permission === 'system') {
      throw new ContractValidationError('status', 'A contract expires on its own once its end date has passed.');
    }

    const reason = options.reason?.trim() || null;
    if (transition.reasonRequired && !reason) {
      throw new ContractValidationError('reason', 'A reason is required for this change.');
    }

    const now = options.now ?? new Date();
    if (to === ContractStatus.PendingSignature) this.assertReadyForSignature();
    if (to === ContractStatus.Active && from !== ContractStatus.Suspended) {
      if (options.documentRequired && !options.hasSignedDocument) {
        throw new ContractValidationError('document', 'Attach the signed contract before activating it.');
      }
    }

    this.status = to;
    switch (to) {
      case ContractStatus.PendingSignature:
        this.lockedAt = now;
        break;
      case ContractStatus.Active:
        if (from === ContractStatus.Suspended) {
          this.suspendedAt = null;
          this.suspensionReason = null;
        } else {
          this.activatedAt = now;
          this.lockedAt = this.lockedAt ?? now;
        }
        break;
      case ContractStatus.Suspended:
        this.suspendedAt = now;
        this.suspensionReason = reason;
        break;
      case ContractStatus.Cancelled:
        this.cancelledAt = now;
        this.cancelReason = reason;
        break;
    }
    this.updatedAt = now;
    return { from, reason };
  }

  /** FR-CON-12: a contract goes out for signature only when its term and price are all there. */
  private assertReadyForSignature(): void {
    const isDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());
    if (!isDate(this.startsAt)) throw new ContractValidationError('startsAt', 'A start date is required before the contract can be sent for signature.');
    if (!isDate(this.endsAt)) throw new ContractValidationError('endsAt', 'An end date is required before the contract can be sent for signature.');
    if (!this.billingPeriod || !isBillingPeriod(this.billingPeriod)) {
      throw new ContractValidationError('billingPeriod', 'A billing period is required before the contract can be sent for signature.');
    }
    if (!Number.isFinite(this.amount) || this.amount <= 0) {
      throw new ContractValidationError('amount', 'A price is required before the contract can be sent for signature.');
    }
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
    renewalDate?: Date | null;
    termsText?: ContractTerms | null;
  }): void {
    if (!this.isLegacy) this.checkDealContractEdits(edits);

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
    if (edits.renewalDate !== undefined) this.renewalDate = edits.renewalDate;
    if (edits.termsText !== undefined) this.termsText = edits.termsText;
    this.updatedAt = new Date();
  }

  /**
   * The edit rules of a contract made from a deal (FR-CON-04, FR-CON-10). The
   * agreed price and the plan name come from the deal and are never typed.
   * While Draft the dates, billing period, terms, renewal date, notes and
   * salesperson can change; after that only the notes and the renewal date
   * (the signed document has its own action), and a changed term means a
   * renewal instead.
   */
  private checkDealContractEdits(edits: {
    planName?: string;
    amount?: number;
    billingPeriod?: BillingPeriod;
    startsAt?: Date;
    endsAt?: Date;
    assignedUserId?: string | null;
    termsText?: ContractTerms | null;
  }): void {
    if (edits.amount !== undefined) {
      throw new ContractEditRefusedError('The price comes from the deal and cannot be changed.', 'amount');
    }
    if (edits.planName !== undefined) {
      throw new ContractEditRefusedError('The plan comes from the deal and cannot be changed.', 'planName');
    }
    if (this.status === ContractStatus.Draft) return;

    const termFields: Array<[keyof typeof edits, string]> = [
      ['startsAt', 'The start date'],
      ['endsAt', 'The end date'],
      ['billingPeriod', 'The billing period'],
      ['assignedUserId', 'The salesperson'],
      ['termsText', 'The terms'],
    ];
    // A form sends every field back, so only a value that really differs is a change.
    const current: Record<string, unknown> = {
      startsAt: this.startsAt.getTime(),
      endsAt: this.endsAt.getTime(),
      billingPeriod: this.billingPeriod,
      assignedUserId: this.assignedUserId,
      termsText: JSON.stringify(this.termsText),
    };
    const proposed = (field: keyof typeof edits): unknown => {
      const value = edits[field];
      if (value instanceof Date) return value.getTime();
      return field === 'termsText' ? JSON.stringify(value) : value;
    };
    for (const [field, label] of termFields) {
      if (edits[field] !== undefined && proposed(field) !== current[field]) {
        throw new ContractEditRefusedError(
          `${label} can no longer be changed on a contract that has gone out for signature. Renew the contract instead.`,
          field
        );
      }
    }
  }

  attachDocument(url: string, name: string): void {
    this.documentUrl = url;
    this.documentName = name;
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
