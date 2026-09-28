import { randomUUID } from 'crypto';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';
import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';

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
      const before = contractSnapshot(contract);
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

      // SYSTEM_ACTOR: same reason changedByUserId is null above — the
      // scheduler, not a person, made this change.
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: SYSTEM_ACTOR.userId,
        userRole: SYSTEM_ACTOR.userRole,
        action: AuditAction.StatusChange,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contractLabel(contract),
        changes: diff(before, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]),
      });

      return { contract };
    });
  }
}
