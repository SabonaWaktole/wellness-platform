import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';

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
    access: AccessContext;
  }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(contract, input.access);

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
