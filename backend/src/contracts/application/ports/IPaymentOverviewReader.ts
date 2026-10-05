import { RecordScope } from '../../../access/domain/RecordScope';
import { Money } from '../../../pricing/domain/Money';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';

/** The filters of the Payments overview and of its CSV export (FR-PAY-11, FR-PAY-14). */
export interface PaymentOverviewFilters {
  tenantId: string;
  /** The companies the viewer may see, from `payments.view` (FR-RBAC-22). Applied in the query. */
  scope: RecordScope;
  /** The workspace day, a UTC-midnight date: what "Due, not invoiced" is measured against. */
  today: Date;
  status?: PaymentStatus;
  clientId?: string;
  /** The responsible salesperson: the contract's, else the company's. */
  assignedUserId?: string;
  contractId?: string;
  /** Part of the company's name or the contract's number. */
  query?: string;
  /** Due date range, both ends included. */
  dueFrom?: Date;
  dueTo?: Date;
  /** Past due and still Not Invoiced (FR-PAY-09). */
  dueNotInvoiced?: boolean;
  areaId?: string;
  cityId?: string;
}

/** One instalment with the contract and company it belongs to. */
export interface PaymentOverviewRow {
  payment: ContractPayment;
  contract: { id: string; number: string | null; planName: string; status: string };
  client: { id: string; name: string };
  salesperson: { id: string; name: string } | null;
}

/** Sums over every instalment that matches the filters, not only the page (FR-PAY-11). */
export interface PaymentOverviewTotals {
  amount: Money;
  received: Money;
  /** What is still owed; a waived instalment owes nothing. */
  outstanding: Money;
}

/**
 * The read side of the Payments overview. The scope is part of the query, so a
 * page of 25 is 25 rows of the viewer's own scope and the totals are of exactly
 * those rows. The sums are made by the database as `Decimal` (NFR-ACC-03).
 */
export interface IPaymentOverviewReader {
  search(filters: PaymentOverviewFilters, page: { page: number; limit: number }): Promise<{
    rows: PaymentOverviewRow[];
    total: number;
    totals: PaymentOverviewTotals;
  }>;
  /** Every matching row, in batches, for the export. */
  exportRows(filters: PaymentOverviewFilters, batchSize: number): AsyncGenerator<PaymentOverviewRow[]>;
}
