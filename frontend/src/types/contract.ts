/** Mirrors the backend's ContractStatus enum (backend Contract.ts). */
export const ContractStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
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

/** Mirrors the backend's PaymentStatus enum (backend ContractPayment.ts). */
export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  PARTIAL: 'PARTIAL',
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

export interface Contract {
  id: string;
  tenantId: string;
  clientId: string;
  clientName?: string;
  assignedUserId: string | null;
  planName: string;
  status: ContractStatus;
  /** Price for ONE billing period, not for the whole term. */
  amount: number;
  billingPeriod: BillingPeriod;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  documentUrl: string | null;
  documentName: string | null;
  renewedFromContractId: string | null;
  activatedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
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
  payments: ContractPayment[];
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
    outstanding: number;
    overdueCount: number;
  };
}
