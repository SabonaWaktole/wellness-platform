import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { PAYMENT_AUDIT_FIELDS, paymentLabel, paymentSnapshot } from './contractAudit';

/**
 * Removes an instalment from the schedule.
 *
 * A row with money already recorded against it is refused. Deleting one would
 * silently reduce what the business believes it collected, and the record of
 * an actual payment is not the sort of thing a stray click should be able to
 * destroy — reverse it to PAYMENT_PENDING first, which is a deliberate second
 * step.
 */
export class DeleteContractPaymentUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    paymentId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    return this.writeTx.run(async (repos) => {
      // Out of scope reads as not found (FR-RBAC-05, 11).
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);

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
        userRole: input.access.auditRole,
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
