import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { ContractValidationError, RenewalNotAllowedError } from '../../domain/contractErrors';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

interface Input {
  tenantId: string;
  contractId: string;
  actingUserId: string;
  access: AccessContext;
}

/**
 * "Not renewing" (FR-REN-08): the salesperson records that this contract will
 * not be renewed, with a reason from the active lost-deal reasons and a note.
 * No further reminders go out for it, and the Renewals screen shows the reason.
 *
 * Needs `contracts.manage` at a scope that admits the contract's company, so a
 * contract outside it reads as "not found". The contract's row is locked first,
 * like "Start renewal", so the two cannot cross: a contract that was renewed or
 * has an open renewal deal is refused, and marking it makes starting one refuse.
 * Audited with the reason and note, in the same transaction (FR-AUD-11).
 */
export class MarkNotRenewingUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: Input & { reasonId: string; note?: string | null }): Promise<void> {
    input.access.ensure('contracts.manage');
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');

    await this.writeTx.run(async (repos) => {
      if (!(await repos.renewals.lock(input.tenantId, input.contractId))) throw new Error('Contract not found');
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);

      const links = await repos.renewals.links(input.tenantId, contract.id);
      if (links.renewedInto) {
        throw new RenewalNotAllowedError('ALREADY_RENEWED', `This contract was already renewed by ${links.renewedInto.number}.`);
      }
      if (links.openDealId) {
        throw new RenewalNotAllowedError('RENEWAL_OPEN', 'A renewal deal is open for this contract; close it first.', links.openDealId);
      }
      if (!(await repos.renewals.activeLostReason(input.tenantId, input.reasonId))) {
        throw new ContractValidationError('reasonId', 'Choose one of the reasons from the list.');
      }

      const before = contractSnapshot(contract);
      contract.markNotRenewing(input.reasonId, input.note ?? null);
      await repos.contractRepo.save(contract);
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contractLabel(contract),
        changes: diff(before, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]),
      });
    });
  }
}

/** Takes "Not renewing" back, so reminders and the renewal state follow the contract again (FR-REN-08). */
export class ClearNotRenewingUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: Input): Promise<void> {
    input.access.ensure('contracts.manage');
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');

    await this.writeTx.run(async (repos) => {
      if (!(await repos.renewals.lock(input.tenantId, input.contractId))) throw new Error('Contract not found');
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);
      if (!contract.notRenewingReasonId) return;

      const before = contractSnapshot(contract);
      contract.clearNotRenewing();
      await repos.contractRepo.save(contract);
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Contract',
        entityId: contract.id,
        entityLabel: contractLabel(contract),
        changes: diff(before, contractSnapshot(contract), [...CONTRACT_AUDIT_FIELDS]),
      });
    });
  }
}
