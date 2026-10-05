import { AccessContext } from '../../access/domain/AccessContext';
import { dueNotInvoiced } from '../domain/instalmentRules';
import { PaymentOverviewRow, PaymentOverviewTotals } from './ports/IPaymentOverviewReader';
import { presentPayment } from './presentPayments';

/**
 * One row of the Payments overview for one viewer (FR-PAY-11, FR-PAY-12): the
 * instalment as the contract page shows it, with its contract and company.
 * Without `commercial.view` the amounts are removed from the response.
 */
export function presentPaymentRow(row: PaymentOverviewRow, access: AccessContext, today: Date) {
  return {
    ...presentPayment(row.payment, access, today),
    contract: row.contract,
    client: row.client,
    salesperson: row.salesperson,
  };
}

/** The totals of the filtered list; without `commercial.view` there are none. */
export function presentPaymentTotals(totals: PaymentOverviewTotals, access: AccessContext) {
  if (!access.can('commercial.view')) return {};
  return {
    amount: totals.amount.toString(),
    paidAmount: totals.received.toString(),
    outstanding: totals.outstanding.toString(),
  };
}

const dayKey = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');

export const CSV_HEADER = [
  'contract',
  'company',
  'salesperson',
  'instalment',
  'dueDate',
  'status',
  'dueNotInvoiced',
  'invoiceNumber',
  'invoiceDate',
  'amount',
  'received',
  'outstanding',
  'receivedOn',
  'method',
] as const;
const MONEY_COLUMNS: readonly string[] = ['amount', 'received', 'outstanding'];

/** The export's columns for one viewer: no money columns without `commercial.view` (FR-PAY-12). */
export const csvColumns = (access: AccessContext) =>
  CSV_HEADER.filter((column) => access.can('commercial.view') || !MONEY_COLUMNS.includes(column));

/**
 * One export row, in the order of `csvColumns`. Money is a plain decimal with
 * two places and a dot, never formatted (NFR-ACC-03); dates are `YYYY-MM-DD`.
 */
export function csvRowFor(row: PaymentOverviewRow, access: AccessContext, today: Date): unknown[] {
  const { payment } = row;
  const state = payment.state();
  const cells: Record<(typeof CSV_HEADER)[number], unknown> = {
    contract: row.contract.number ?? row.contract.id,
    company: row.client.name,
    salesperson: row.salesperson?.name ?? '',
    instalment: payment.periodIndex,
    dueDate: dayKey(payment.dueDate),
    status: payment.status,
    dueNotInvoiced: dueNotInvoiced(state, today) ? 'yes' : 'no',
    invoiceNumber: payment.invoiceNumber ?? '',
    invoiceDate: dayKey(payment.invoiceDate),
    amount: state.amount.toString(),
    received: state.paidAmount.toString(),
    outstanding: payment.toJSON().outstanding,
    receivedOn: dayKey(payment.paidAt),
    method: payment.method ?? '',
  };
  return csvColumns(access).map((column) => cells[column]);
}
