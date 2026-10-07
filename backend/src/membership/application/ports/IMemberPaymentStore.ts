import type { PaymentMethod } from '../../domain/memberPayment';
import type { TermSource } from '../../domain/MemberTerm';
import type { Tier } from '../../domain/Tier';
import type { PaymentKind } from '../../domain/termDates';

/** A term with the keys payments use to create, close and restore it (D3). Dates are days, YYYY-MM-DD. */
export interface PaymentTermRecord {
  id: string;
  tier: Tier;
  source: TermSource;
  startsOn: string;
  endsOn: string | null;
  paymentId: string | null;
  closedEarlyByPaymentId: string | null;
  originalEndsOn: string | null;
  /** The ended term this downgrade term follows (D3, M4 Slice 8). */
  followsTermId: string | null;
}

/** A payment as stored. Money is a two-decimal string, never a number (NFR-ACC-05). */
export interface MemberPaymentRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberFirstName: string;
  memberLastName: string;
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  listFee: string;
  discountPercent: string;
  amount: string;
  method: PaymentMethod;
  receivedOn: string;
  receiptNumber: string;
  note: string | null;
  recordedBy: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export interface NewMemberPayment {
  id: string;
  tenantId: string;
  memberId: string;
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  listFee: string;
  discountPercent: string;
  amount: string;
  method: PaymentMethod;
  receivedOn: string;
  receiptNumber: string;
  note: string | null;
  recordedBy: string;
}

export interface NewPaymentTerm {
  id: string;
  memberId: string;
  tier: Tier;
  source: TermSource;
  startsOn: string;
  endsOn: string | null;
  /** Null for a term no payment created: a VIP term is free (FR-VIP-03). */
  paymentId: string | null;
  /** Set only on a downgrade term the daily job creates: unique, so one downgrade per ended term (D3). */
  followsTermId?: string | null;
}

export interface PaymentFilters {
  from?: string;
  to?: string;
  tier?: Tier;
  kind?: PaymentKind;
  method?: PaymentMethod;
  agentId?: string;
  status?: 'RECORDED' | 'VOIDED';
  memberId?: string;
}

export interface TierHistoryEntry {
  memberId: string;
  fromTier: Tier;
  toTier: Tier;
  reason: string;
  comment: string | null;
  changedByUserId: string | null;
  /** The day the tier really changed, when the job records a step-down it found late (D4). Defaults to now. */
  effectiveOn?: string;
}

/** Payments, and the terms and tier history a payment changes, on one connection. */
export interface IMemberPaymentStore {
  /**
   * Takes the member's row lock until the transaction ends, so a payment and a
   * void of the same member run one after the other. False when there is no
   * such member in the workspace.
   */
  lockMember(tenantId: string, memberId: string): Promise<boolean>;
  listTerms(memberId: string): Promise<PaymentTermRecord[]>;
  insertTerm(term: NewPaymentTerm): Promise<void>;
  /** Ends a paid or downgrade term early, keeping the end date it had so a void can restore it (D3). */
  closeTermEarly(termId: string, endsOn: string, closedByPaymentId: string, originalEndsOn: string): Promise<void>;
  /** Puts back what `closeTermEarly` took away. */
  restoreTerm(termId: string, endsOn: string): Promise<void>;
  deleteTermsOfPayment(paymentId: string): Promise<void>;
  /** Ends a VIP term early, keeping the end date it had (FR-VIP-05). */
  endTermEarly(termId: string, endsOn: string, originalEndsOn: string): Promise<void>;
  deleteTerm(termId: string): Promise<void>;
  create(payment: NewMemberPayment): Promise<MemberPaymentRecord>;
  find(tenantId: string, id: string): Promise<MemberPaymentRecord | null>;
  /** The member's newest payment that is not voided. */
  latestActive(tenantId: string, memberId: string): Promise<MemberPaymentRecord | null>;
  markVoided(tenantId: string, id: string, voidedAt: Date, voidedBy: string, reason: string): Promise<void>;
  listForMember(tenantId: string, memberId: string): Promise<MemberPaymentRecord[]>;
  /** One page of the filtered list, with the total of the whole filtered list, voided payments excluded (FR-MPAY-07). */
  search(tenantId: string, filters: PaymentFilters, page: number, limit: number): Promise<{ data: MemberPaymentRecord[]; total: number; totalAmount: string }>;
  setCurrentTier(tenantId: string, memberId: string, tier: Tier): Promise<void>;
  addTierHistory(entry: TierHistoryEntry): Promise<void>;
  /** Whether the employer company holds a contract valid on the day (D8). A sponsored term follows it. */
  employerContractValid(tenantId: string, clientId: string, day: string): Promise<boolean>;
}

/** The next receipt number of the workspace year, per calendar year (FR-MPAY-05, D7). */
export interface IReceiptNumbers {
  next(tenantId: string, year: number): Promise<string>;
}
