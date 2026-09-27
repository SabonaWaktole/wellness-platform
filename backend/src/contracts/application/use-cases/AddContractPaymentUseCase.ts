import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { ContractPayment } from '../../domain/ContractPayment';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';

/**
 * Adds a payment row the generated schedule did not anticipate — a setup fee,
 * an extra seat mid-term, a negotiated catch-up instalment.
 *
 * `periodIndex` is derived rather than asked for: it is a display ordering, and
 * making the caller invent one is how two rows end up claiming to be the third
 * instalment. New rows land at the end of the sequence and sort by due date
 * like everything else.
 */
export class AddContractPaymentUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    dueDate: Date;
    amount: number;
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

      const existing = await repos.paymentRepo.findByContractId(input.tenantId, input.contractId);
      const nextIndex = existing.reduce((max, p) => Math.max(max, p.periodIndex), 0) + 1;

      const payment = ContractPayment.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        contractId: input.contractId,
        periodIndex: nextIndex,
        dueDate: input.dueDate,
        amount: input.amount,
        method: input.method ?? null,
        note: input.note ?? null,
      });

      await repos.paymentRepo.save(payment);

      const updated = await repos.contractRepo.findById(input.tenantId, input.contractId);
      return { payment, contract: updated ?? contract };
    });
  }
}
