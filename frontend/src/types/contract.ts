/** Mirrors the backend's ContractStatus enum (backend Contract.ts). */
export const ContractStatus = {
  DRAFT: 'DRAFT',
  PENDING_SIGNATURE: 'PENDING_SIGNATURE',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

/** Mirrors the backend's BillingPeriod enum. */
export const BillingPeriod = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
  ONE_TIME: 'ONE_TIME',
} as const;

export type BillingPeriod = (typeof BillingPeriod)[keyof typeof BillingPeriod];

/**
 * Mirrors the backend's PaymentStatus enum (backend ContractPayment.ts).
 * WAIVED is the one legacy key (decision D6, Slice 10): existing rows keep
 * it, but it is not offered for a new payment and has no configurable label.
 */
export const PaymentStatus = {
  NOT_INVOICED: 'NOT_INVOICED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Rollup of a contract's payment rows, computed server-side.
 *
 * Optional because list endpoints may omit it — `undefined` means "not
 * loaded", which is not the same as "nothing owed". Render a placeholder
 * rather than a zero when it is missing.
 */
export interface ContractPaymentSummary {
  total: number;
  paid: number;
  outstanding: number;
  unpaidCount: number;
  overdueCount: number;
}

/** A service of the contract's package, copied from the offer (FR-CON-03). */
export interface ContractServiceLine {
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
}

/** The offer's terms, one rich-text document per language. */
export interface ContractTerms {
  sq: Record<string, unknown> | null;
  en: Record<string, unknown> | null;
}

/**
 * The validity badge of a contract or a company (FR-CON-21, FR-CON-22), decided
 * by the server. `reason` is a contract status, `NOT_STARTED` or `NO_CONTRACT`.
 */
export interface ValidityBadgeData {
  status: 'VALID' | 'EXPIRING_SOON' | 'NOT_VALID';
  reason: string | null;
  /** `YYYY-MM-DD`; null when the company has no contract. */
  startsOn: string | null;
  endsOn: string | null;
  daysLeft: number | null;
}

/**
 * A contract as the API returns it to this viewer (FR-RBAC-06). Without
 * `contracts.manage` only the validity fields are present (Reception's view);
 * `amount` needs `commercial.view` and `paymentSummary` needs `payments.view`.
 * Everything a viewer might not be sent is optional — absent means "not
 * yours to see", never zero.
 */
export interface Contract {
  id: string;
  tenantId?: string;
  /** Absent for Reception, who gets `company` instead (FR-RBAC-21). */
  clientId?: string;
  clientName?: string;
  /** Reception's view names the company this way. */
  company?: { id: string; name: string };
  /** The server's verdict for today; sent on every read. */
  validity?: ValidityBadgeData;
  assignedUserId?: string | null;
  /** A commercial field: absent for Reception. */
  planName?: string;
  status: ContractStatus;
  /**
   * Price for ONE billing period, not for the whole term. A two-decimal
   * string ("49.40"): it is only formatted here, never calculated (NFR-ACC-03).
   */
  amount?: string;
  /** CTR-2026-0001 (FR-CON-05); null on a Legacy contract. */
  number?: string | null;
  /** Made before contracts needed a won deal (FR-CON-02). */
  legacy?: boolean;
  dealId?: string | null;
  dealTitle?: string | null;
  quotationId?: string | null;
  quotationReference?: string | null;
  packageId?: string | null;
  packageName?: string | null;
  servicesSnapshot?: ContractServiceLine[] | null;
  termsText?: ContractTerms | null;
  agreedAnnualValue?: string | null;
  discountPercent?: string | null;
  /** `YYYY-MM-DD`: the date by which a renewal should be agreed (FR-CON-07). */
  renewalDate?: string | null;
  billingPeriod?: BillingPeriod;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  renewedFromContractId?: string | null;
  activatedAt?: string | null;
  cancelledAt?: string | null;
  /** Set when the contract goes out for signature: the agreed values are locked from then on (FR-CON-12). */
  lockedAt?: string | null;
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  cancelReason?: string | null;
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentSummary?: ContractPaymentSummary;
  /** Negative once the term has lapsed. Absent for Reception, who gets `validity.daysLeft`. */
  daysUntilExpiry?: number;
}

/** The ways money can arrive (FR-PAY-03). Existing rows may hold older free text. */
export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * One instalment (FR-PAY-03). Money is a two-decimal string, only formatted here and
 * never calculated (NFR-ACC-03). `amount`, `paidAmount` and `outstanding` are absent
 * without `commercial.view`; the whole payment is absent without `payments.view` (FR-PAY-12).
 */
export interface ContractPayment {
  id: string;
  tenantId: string;
  contractId: string;
  periodIndex: number;
  dueDate: string;
  amount?: string;
  status: PaymentStatus;
  paidAmount?: string;
  outstanding?: string;
  /** The date of the last receipt. */
  paidAt: string | null;
  method: string | null;
  note: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** Past its due date and still Not Invoiced: keeps its status, shows a flag (FR-PAY-09). */
  dueNotInvoiced: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The contract's payment summary, worked out by the server from its instalments (FR-PAY-10). */
export interface InstalmentSummary {
  total?: string;
  received?: string;
  outstanding?: string;
  /** `YYYY-MM-DD`. */
  nextDueDate: string | null;
  overdueCount: number;
  overdueAmount?: string;
}

/**
 * One change to an instalment (FR-PAY-08). Every receipt is one entry; a reversal has a
 * negative amount. `fromStatus` is `NONE` when the instalment was added.
 */
export interface ContractPaymentHistoryEntry {
  id: string;
  paymentId: string;
  fromStatus: string;
  toStatus: string;
  amountReceived?: string;
  receivedOn: string | null;
  method: string | null;
  /** Null when the system made the change. */
  changedByUserId: string | null;
  comment: string | null;
  changedAt: string;
}

export interface ContractStatusHistoryEntry {
  id: string;
  contractId: string;
  fromStatus: string;
  toStatus: string;
  changedByUserId: string | null;
  changedAt: string;
  note: string | null;
}

/** One file of the signed document; the newest is current, the others are previous versions (FR-CON-19). */
export interface ContractDocumentVersion {
  id: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedAt: string;
  isCurrent: boolean;
}

/**
 * What the detail endpoint returns. `permittedActions` is computed server-side
 * from the entity's own transition rules — the UI must gate its buttons on
 * this rather than re-deriving them from `status`, which would be a second
 * copy of those rules.
 */
/** A neighbouring term, named by its number (M3 FR-REN-07). */
export interface RenewalContractRef {
  id: string;
  number: string;
}

/** How a contract is tied to the next and previous term and to an open renewal deal (M3 Slice 10). */
export interface ContractRenewalLinks {
  renewedFrom: RenewalContractRef | null;
  renewedInto: RenewalContractRef | null;
  /** Absent without `commercial.view`. */
  openDealId?: string | null;
}

export interface ContractDetail {
  contract: Contract;
  /** Absent without `payments.view` (FR-RBAC-06). */
  payments?: ContractPayment[];
  paymentSummary?: InstalmentSummary;
  history: ContractStatusHistoryEntry[];
  /** Absent without `commercial.view` (FR-RBAC-21). Newest first. */
  documents?: ContractDocumentVersion[];
  permittedActions: string[];
  /** Absent for a viewer without `contracts.manage`. */
  renewal?: ContractRenewalLinks;
}

/** The client-page view: every term for one business, plus the headline facts. */
export interface ClientContracts {
  contracts: Contract[];
  summary: {
    hasActiveContract: boolean;
    activeContractId: string | null;
    /** A commercial field: absent without `commercial.view`. */
    activePlanName?: string | null;
    /** The company's one badge (FR-CON-22). */
    validity?: ValidityBadgeData;
    activeEndsAt: string | null;
    daysUntilExpiry: number | null;
    totalContracts: number;
    /** Absent without `payments.view` (FR-RBAC-06). */
    outstanding?: number;
    overdueCount?: number;
  };
}
