import { randomUUID } from 'crypto';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

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
    actingUserRole: string;
  }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(contract, input.actingUserId, input.actingUserRole);

      const before = contractSnapshot(contract);
      contract.cancel();

      await repos.contractRepo.save(contract);
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus: before.status as string,
          toStatus: contract.status,
          changedByUserId: input.actingUserId,
          note: input.reason ?? null,
        })
      );

      const changes = diff(before, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]);
      if (input.reason) {
        changes.push({ field: 'cancelReason', old: null, new: input.reason });
      }
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.actingUserRole,
        action: AuditAction.StatusChange,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contractLabel(contract),
        changes,
      });

      return { contract };
    });
  }
}
