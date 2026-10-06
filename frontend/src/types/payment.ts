import type { ContractPayment } from './contract';

/** One row of the Payments overview: the instalment with its contract and company (FR-PAY-11). */
export interface PaymentOverviewRow extends ContractPayment {
  contract: { id: string; number: string | null; planName: string; status: string };
  client: { id: string; name: string };
  salesperson: { id: string; name: string } | null;
}

/**
 * The totals of the whole filtered list, summed by the server. Money is a string that is
 * only formatted (NFR-ACC-03). Empty without `commercial.view`.
 */
export interface PaymentTotals {
  amount?: string;
  paidAmount?: string;
  outstanding?: string;
}

export interface PaymentsPage {
  data: PaymentOverviewRow[];
  total: number;
  page: number;
  limit: number;
  totals: PaymentTotals;
}

/** What the overview and its export are filtered by. Every value is optional. */
export interface PaymentFilters {
  status?: string;
  /** Part of the company's name or the contract's number. */
  query?: string;
  clientId?: string;
  contractId?: string;
  assignedUserId?: string;
  /** `YYYY-MM-DD`, both ends included. */
  dueFrom?: string;
  dueTo?: string;
  dueNotInvoiced?: 'true';
  areaId?: string;
  cityId?: string;
}
