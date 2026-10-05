import { randomUUID } from 'crypto';
import { ContractStatus } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';
import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';
import { isBeforeDay } from '../../domain/calendarDay';
import { updateCompanyStatusAfterEnd } from './updateCompanyStatus';

/**
 * System-triggered transition, same shape as `MarkInvoiceOverdueUseCase` — no
 * acting user, because the scheduler is not a person.
 *
 * `today` is the workspace day (a UTC-midnight date) and `now` the instant of
 * the run, which the history row is stamped with. The contract is only
 * expired when its end date is before it, re-checked inside the transaction so
 * a contract renewed or extended since the sweep read it is left alone. Returns
 * null when it did nothing, which is what makes a second run harmless
 * (FR-CON-16, NFR-REL-01). Afterwards the company may become a Former client
 * (FR-CON-17).
 */
export class ExpireContractUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: { tenantId: string; contractId: string; today: Date; now: Date }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }
      if (contract.status !== ContractStatus.Active || !isBeforeDay(contract.endsAt, input.today)) {
        return null;
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
          changedAt: input.now,
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

      await updateCompanyStatusAfterEnd(repos, {
        tenantId: input.tenantId,
        clientId: contract.clientId,
        clientName: contract.clientName ?? null,
        today: input.today,
        actor: SYSTEM_ACTOR,
      });

      return { contract };
    });
  }
}
