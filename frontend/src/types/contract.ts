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
 * A contract as the API returns it to this viewer (FR-RBAC-06). Without
 * `contracts.manage` only the validity fields are present (Reception's view);
 * `amount` needs `commercial.view` and `paymentSummary` needs `payments.view`.
 * Everything a viewer might not be sent is optional — absent means "not
 * yours to see", never zero.
 */
export interface Contract {
  id: string;
  tenantId?: string;
  clientId: string;
  clientName?: string;
  assignedUserId?: string | null;
  planName: string;
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
  createdByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentSummary?: ContractPaymentSummary;
  /** Negative once the term has lapsed. */
  daysUntilExpiry: number;
}

export interface ContractPayment {
  id: string;
  tenantId: string;
  contractId: string;
  periodIndex: number;
  dueDate: string;
  amount: number;
  status: PaymentStatus;
  paidAmount: number;
  outstanding: number;
  paidAt: string | null;
  method: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
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

/**
 * What the detail endpoint returns. `permittedActions` is computed server-side
 * from the entity's own transition rules — the UI must gate its buttons on
 * this rather than re-deriving them from `status`, which would be a second
 * copy of those rules.
 */
export interface ContractDetail {
  contract: Contract;
  /** Absent without `payments.view` (FR-RBAC-06). */
  payments?: ContractPayment[];
  history: ContractStatusHistoryEntry[];
  permittedActions: string[];
}

/** The client-page view: every term for one business, plus the headline facts. */
export interface ClientContracts {
  contracts: Contract[];
  summary: {
    hasActiveContract: boolean;
    activeContractId: string | null;
    activePlanName: string | null;
    activeEndsAt: string | null;
    daysUntilExpiry: number | null;
    totalContracts: number;
    /** Absent without `payments.view` (FR-RBAC-06). */
    outstanding?: number;
    overdueCount?: number;
  };
}
