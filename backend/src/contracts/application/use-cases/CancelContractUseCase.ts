import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';

/**
 * Ends a term early.
 *
 * Outstanding payment rows are deliberately left alone. A customer who walks
 * away mid-term may still owe the months already billed, and silently wiping
 * the schedule would erase that debt from the record — if the business decides
 * to forgive it, that is what WAIVED on each row is for, and it leaves a trail.
 */
export class CancelContractUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    reason?: string | null;
    actingUserId: string;
    access: AccessContext;
  }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(contract, input.access);

      const fromStatus = contract.status;
      contract.cancel();

      await repos.contractRepo.save(contract);
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus,
          toStatus: contract.status,
          changedByUserId: input.actingUserId,
          note: input.reason ?? null,
        })
      );

      return { contract };
    });
  }
}
