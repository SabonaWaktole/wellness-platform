import { AuditAction } from '../../../audit/domain/AuditAction';
import { AuditActor } from '../../../audit/domain/AuditEntry';
import { shouldBecomeFormerClient } from '../../domain/companyStanding';
import { ContractWriteRepos } from '../ports/IContractWriteTransaction';

/**
 * After a contract has Expired or been Cancelled: a Client with nothing valid
 * or upcoming left, and no renewal deal open, becomes a Former client
 * (FR-CON-17, Q16). Runs inside the transition's transaction, after the
 * contract itself is saved, so it sees the new status.
 *
 * Activating a contract sets Client again (`ChangeContractStatusUseCase`).
 */
export async function updateCompanyStatusAfterEnd(
  repos: ContractWriteRepos,
  input: { tenantId: string; clientId: string; clientName: string | null; today: Date; actor: AuditActor }
): Promise<boolean> {
  const contracts = await repos.contractRepo.findByClientId(input.tenantId, input.clientId);
  const openRenewal = await repos.companyStatus.hasOpenRenewalDeal(input.tenantId, input.clientId);
  if (!shouldBecomeFormerClient(contracts, input.today, openRenewal)) return false;

  const moved = await repos.companyStatus.makeFormerClient(input.tenantId, input.clientId);
  if (!moved) return false;

  await repos.auditTrail.record({
    tenantId: input.tenantId,
    userId: input.actor.userId,
    userRole: input.actor.userRole,
    action: AuditAction.Update,
    entityType: 'Client',
    entityId: input.clientId,
    entityLabel: input.clientName ?? input.clientId,
    changes: [{ field: 'status', old: moved.previous, new: 'FORMER_CLIENT' }],
  });
  return true;
}
