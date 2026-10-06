import { Money } from '../../pricing/domain/Money';
import { PaymentStatus } from './ContractPayment';
import { daysBetween } from './calendarDay';
import { outstanding } from './instalmentRules';

export interface SummarisedInstalment {
  amount: Money;
  paidAmount: Money;
  status: PaymentStatus;
  dueDate: Date;
}

export interface PaymentSummary {
  total: Money;
  received: Money;
  outstanding: Money;
  /** Earliest due date, today or later, of an instalment that still owes money. */
  nextDueDate: Date | null;
  overdueCount: number;
  overdueAmount: Money;
}

/**
 * The contract's payment summary (FR-PAY-10), worked out from its instalments.
 * Waived instalments are left out of the total: the business gave them away,
 * so they are neither owed nor revenue. "Overdue" is the stored status, which
 * only the daily job sets, so the summary and the Payments overview agree.
 */
export function summarise(instalments: readonly SummarisedInstalment[], today: Date): PaymentSummary {
  let total = Money.zero();
  let received = Money.zero();
  let owed = Money.zero();
  let overdueAmount = Money.zero();
  let overdueCount = 0;
  let nextDueDate: Date | null = null;

  for (const instalment of instalments) {
    if (instalment.status === PaymentStatus.Waived) continue;

    const left = outstanding(instalment);
    total = total.add(instalment.amount);
    received = received.add(instalment.paidAmount);
    owed = owed.add(left);

    if (instalment.status === PaymentStatus.Overdue) {
      overdueCount += 1;
      overdueAmount = overdueAmount.add(left);
    }

    if (left.isPositive() && daysBetween(today, instalment.dueDate) >= 0) {
      if (nextDueDate === null || instalment.dueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = instalment.dueDate;
      }
    }
  }

  return { total, received, outstanding: owed, nextDueDate, overdueCount, overdueAmount };
}
