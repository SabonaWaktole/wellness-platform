import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';

/**
 * Marks an instalment paid, part-paid, waived, or back to unpaid.
 *
 * This is the module's whole answer to "did they pay?" — a person asserting a
 * fact, not a gateway reporting one. Every action is reversible (`UNPAID`
 * resets the row) precisely because human bookkeeping is: the point is to make
 * correcting a mistake cheap rather than to guard an irreversible ledger.
 */
export class RecordContractPaymentUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    paymentId: string;
    action: 'PAY' | 'UNPAY' | 'WAIVE';
    amount?: number;
    paidAt?: Date;
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
      // The parent check is not redundant with this one: without it, a payment
      // id from another of the tenant's contracts would be accepted and
      // recorded against the wrong account.
      if (!payment || payment.contractId !== input.contractId) {
        throw new Error('Payment not found');
      }

      switch (input.action) {
        case 'PAY':
          payment.recordPayment({
            amount: input.amount,
            paidAt: input.paidAt,
            method: input.method,
            note: input.note,
          });
          break;
        case 'UNPAY':
          payment.markUnpaid();
          break;
        case 'WAIVE':
          payment.waive(input.note);
          break;
      }

      await repos.paymentRepo.save(payment);

      // Re-read so the caller gets a contract whose rollup reflects the write
      // it just made, rather than the totals from before it.
      const updated = await repos.contractRepo.findById(input.tenantId, input.contractId);
      return { payment, contract: updated ?? contract };
    });
  }
}
