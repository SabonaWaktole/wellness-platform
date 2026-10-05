import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { ContractValidationError } from '../../domain/contractErrors';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';
import { DealStage } from '../../../deals/domain/DealStage';

/**
 * "Refresh from deal" (FR-CON-04): while the contract is a Draft, re-reads the
 * agreed price, annual value, discount, package, services, offer and terms
 * from the deal's current won offer, for example after the Sales Manager
 * reopened the deal and a new offer was won. From Pending Signature on the
 * values are locked and the entity refuses.
 */
export class RefreshContractFromDealUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver
  ) {}

  async execute(input: { tenantId: string; contractId: string; actingUserId: string; access: AccessContext }) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    return this.writeTx.run(async (repos) => {
      const contract = reachableContract(await repos.contractRepo.findById(input.tenantId, input.contractId), scope);
      if (!contract.dealId) {
        throw new ContractValidationError('dealId', 'A contract without a deal cannot be refreshed from a deal.');
      }

      const deal = await repos.deals.find(input.tenantId, contract.dealId);
      if (!deal || deal.stageKey !== DealStage.Won || !deal.source) {
        throw new ContractValidationError('dealId', 'The deal is not won, so it has no agreed values to read.');
      }

      const before = contractSnapshot(contract);
      contract.refreshFromDeal(deal.source);
      await repos.contractRepo.save(contract);

      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus: contract.status,
          toStatus: contract.status,
          changedByUserId: input.actingUserId,
          note: 'Refreshed from deal',
        })
      );

      const saved = (await repos.contractRepo.findById(input.tenantId, contract.id)) ?? contract;
      const changes = diff(before, contractSnapshot(saved), [...CONTRACT_AUDIT_FIELDS]);
      if (changes.length > 0) {
        await repos.auditTrail.record({
          tenantId: input.tenantId,
          userId: input.actingUserId,
          userRole: input.access.auditRole,
          action: AuditAction.Update,
          entityType: 'Contract',
          entityId: contract.id,
          entityLabel: contractLabel(saved),
          changes,
        });
      }
      return { contract: saved };
    });
  }
}
