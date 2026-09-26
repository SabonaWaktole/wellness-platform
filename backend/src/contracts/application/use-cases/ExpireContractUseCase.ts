import { randomUUID } from 'crypto';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';

/**
 * System-triggered transition, same shape as `MarkInvoiceOverdueUseCase` — no
 * acting user, because the scheduler is not a person.
 */
export class ExpireContractUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: { tenantId: string; contractId: string }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      const fromStatus = contract.status;
      contract.expire();

      await repos.contractRepo.save(contract);
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus,
          toStatus: contract.status,
          // NULL: the scheduler made this change, not a person. Same
          // convention as InvoiceStatusHistory.changedByUserId.
          changedByUserId: null,
          note: 'Term ended',
        })
      );

      return { contract };
    });
  }
}
