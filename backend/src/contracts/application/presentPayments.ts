import { AccessContext } from '../../access/domain/AccessContext';
import { ContractPayment } from '../domain/ContractPayment';
import { ContractPaymentHistoryEntry, presentPaymentHistoryEntry } from '../domain/ContractPaymentHistory';
import { dueNotInvoiced } from '../domain/instalmentRules';
import { PaymentSummary, summarise } from '../domain/paymentSummary';

/**
 * What a viewer may see of an instalment (FR-PAY-12, FR-RBAC-21). The route
 * needs `payments.view`; without `commercial.view` the amounts are removed from
 * the response, not hidden in the page. Reception has neither and gets no
 * payment response at all. Money is a two-decimal string (NFR-ACC-03).
 */
const AMOUNT_KEYS = ['amount', 'paidAmount', 'outstanding'] as const;

const dayKey = (day: Date) => day.toISOString().slice(0, 10);

export function presentPayment(payment: ContractPayment, access: AccessContext, today: Date) {
  const view: Record<string, unknown> = {
    ...payment.toJSON(),
    // Past its due date and still Not Invoiced: keeps its status, shows a flag (FR-PAY-09).
    dueNotInvoiced: dueNotInvoiced(payment.state(), today),
  };
  if (!access.can('commercial.view')) for (const key of AMOUNT_KEYS) delete view[key];
  return view;
}

export function presentPaymentSummary(summary: PaymentSummary, access: AccessContext) {
  const view: Record<string, unknown> = {
    total: summary.total.toString(),
    received: summary.received.toString(),
    outstanding: summary.outstanding.toString(),
    nextDueDate: summary.nextDueDate ? dayKey(summary.nextDueDate) : null,
    overdueCount: summary.overdueCount,
    overdueAmount: summary.overdueAmount.toString(),
  };
  if (!access.can('commercial.view')) for (const key of ['total', 'received', 'outstanding', 'overdueAmount']) delete view[key];
  return view;
}

/** The instalments of a contract and their summary (FR-PAY-10), for one viewer. */
export function presentInstalments(payments: ContractPayment[], access: AccessContext, today: Date) {
  return {
    payments: payments.map((payment) => presentPayment(payment, access, today)),
    summary: presentPaymentSummary(summarise(payments.map((p) => p.state()), today), access),
  };
}

export function presentPaymentHistory(history: ContractPaymentHistoryEntry[], access: AccessContext) {
  return history.map((entry) => {
    const view: Record<string, unknown> = presentPaymentHistoryEntry(entry);
    if (!access.can('commercial.view')) delete view.amountReceived;
    return view;
  });
}

