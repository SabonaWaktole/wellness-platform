import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { PAYMENT_AUDIT_FIELDS, paymentLabel, paymentSnapshot } from './contractAudit';

/** Corrects an instalment's due date, amount or annotation. */
export class UpdateContractPaymentUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    paymentId: string;
    dueDate?: Date;
    amount?: number;
    method?: string | null;
    note?: string | null;
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

      const before = paymentSnapshot(payment);

      payment.applyEdits({
        dueDate: input.dueDate,
        amount: input.amount,
        method: input.method,
        note: input.note,
      });

      await repos.paymentRepo.save(payment);

      const changes = diff(before, paymentSnapshot(payment), [...PAYMENT_AUDIT_FIELDS]);
      if (changes.length > 0) {
        await repos.auditTrail.record({
          tenantId: input.tenantId,
          userId: input.actingUserId,
          userRole: input.actingUserRole,
          action: AuditAction.Update,
          entityType: 'ContractPayment',
          entityId: payment.id,
          entityLabel: paymentLabel(contract, payment),
          changes,
        });
      }

      const updated = await repos.contractRepo.findById(input.tenantId, input.contractId);
      return { payment, contract: updated ?? contract };
    });
  }
}
