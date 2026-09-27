import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

/** Corrects an instalment's due date, amount or annotation. */
export class UpdateContractPaymentUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private scopes: RecordScopeResolver
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    paymentId: string;
    dueDate?: Date;
    amount?: number;
    method?: string | null;
    note?: string | null;
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

      payment.applyEdits({
        dueDate: input.dueDate,
        amount: input.amount,
        method: input.method,
        note: input.note,
      });

      await repos.paymentRepo.save(payment);

      const updated = await repos.contractRepo.findById(input.tenantId, input.contractId);
      return { payment, contract: updated ?? contract };
    });
  }
}
