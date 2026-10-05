import { randomUUID } from 'crypto';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';
import { Money } from '../../../pricing/domain/Money';
import { PaymentStatus } from '../../domain/ContractPayment';
import { overdueOn } from '../../domain/instalmentRules';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { PAYMENT_AUDIT_FIELDS, paymentLabel, paymentSnapshot } from './contractAudit';

/**
 * The daily job's change to one instalment: Invoice Issued, Payment Pending or
 * Partially Paid, past its due date plus the grace days, becomes Overdue
 * (FR-PAY-09). Done by the system, so the history row has no user and the audit
 * entry carries the system actor.
 *
 * The rule is checked again inside the transaction, so an instalment that was
 * paid, corrected or moved since the sweep read it is left alone. Returns null
 * when it did nothing, which is what makes a second run harmless (NFR-REL-01).
 */
export class MarkPaymentOverdueUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: { tenantId: string; paymentId: string; today: Date; graceDays: number; now: Date }) {
    return this.writeTx.run(async (repos) => {
      const payment = await repos.paymentRepo.findById(input.tenantId, input.paymentId);
      if (!payment) throw new Error('Payment not found');
      if (!overdueOn(payment.state(), input.today, input.graceDays)) return null;

      const contract = await repos.contractRepo.findById(input.tenantId, payment.contractId);
      if (!contract) throw new Error('Contract not found');

      const before = paymentSnapshot(payment);
      const fromStatus = payment.status;
      payment.apply({ status: PaymentStatus.Overdue });
      payment.updatedAt = input.now;

      await repos.paymentRepo.save(payment);
      await repos.paymentHistoryRepo.save({
        id: randomUUID(),
        tenantId: input.tenantId,
        paymentId: payment.id,
        fromStatus,
        toStatus: payment.status,
        amountReceived: Money.zero(),
        receivedOn: null,
        method: null,
        // NULL: the scheduler made this change, not a person.
        changedByUserId: null,
        comment: 'Past its due date',
        changedAt: input.now,
      });
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: SYSTEM_ACTOR.userId,
        userRole: SYSTEM_ACTOR.userRole,
        action: AuditAction.StatusChange,
        entityType: 'ContractPayment',
        entityId: payment.id,
        entityLabel: paymentLabel(contract, payment),
        changes: diff(before, paymentSnapshot(payment), [...PAYMENT_AUDIT_FIELDS]),
      });

      return { payment, contract };
    });
  }
}
