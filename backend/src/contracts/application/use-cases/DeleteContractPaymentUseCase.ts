import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { PAYMENT_AUDIT_FIELDS, paymentLabel, paymentSnapshot } from './contractAudit';

/**
 * Removes an instalment from the schedule.
 *
 * A row with money already recorded against it is refused. Deleting one would
 * silently reduce what the business believes it collected, and the record of
 * an actual payment is not the sort of thing a stray click should be able to
 * destroy — reverse it to UNPAID first, which is a deliberate second step.
 */
export class DeleteContractPaymentUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    paymentId: string;
    actingUserId: string;
    actingUserRole: string;
  }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(contract, input.actingUserId, input.actingUserRole);

      const payment = await repos.paymentRepo.findById(input.tenantId, input.paymentId);
      if (!payment || payment.contractId !== input.contractId) {
        throw new Error('Payment not found');
      }

      if (payment.paidAmount > 0) {
        throw new Error('A payment with money recorded against it cannot be deleted; reset it to unpaid first');
      }

      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.actingUserRole,
        action: AuditAction.Delete,
        entityType: 'ContractPayment',
        entityId: payment.id,
        entityLabel: paymentLabel(contract, payment),
        changes: diff(paymentSnapshot(payment), {} as Record<string, unknown>, [...PAYMENT_AUDIT_FIELDS]),
      });

      await repos.paymentRepo.delete(input.tenantId, input.paymentId);

      const updated = await repos.contractRepo.findById(input.tenantId, input.contractId);
      return { contract: updated ?? contract };
    });
  }
}
