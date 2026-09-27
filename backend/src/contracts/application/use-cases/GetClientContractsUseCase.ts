import { AccessContext } from '../../../access/domain/AccessContext';
import { IContractRepository } from '../../domain/IContractRepository';
import { ContractStatus } from '../../domain/Contract';
import { canAccessContract } from './contractAccess';

/**
 * Every term for one client, plus the answer to the question the client page
 * actually asks: are they a paying customer right now, and do they owe us
 * anything?
 *
 * The rollup is computed here rather than in the repository because it spans
 * contracts, and "outstanding across all of this client's terms" includes
 * arrears left behind by a term that has already ended.
 */
export class GetClientContractsUseCase {
  constructor(private contractRepo: IContractRepository) {}

  async execute(input: {
    tenantId: string;
    clientId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    const all = await this.contractRepo.findByClientId(input.tenantId, input.clientId);
    const contracts = all.filter((contract) =>
      canAccessContract(contract, input.access, 'contracts.validity.view')
    );

    const active = contracts.find((contract) => contract.status === ContractStatus.Active) ?? null;

    const outstanding = contracts.reduce(
      (sum, contract) => sum + (contract.paymentSummary?.outstanding ?? 0),
      0
    );
    const overdueCount = contracts.reduce(
      (sum, contract) => sum + (contract.paymentSummary?.overdueCount ?? 0),
      0
    );

    return {
      contracts,
      summary: {
        // The single most useful fact about a business on this list: are they
        // currently subscribed, and until when.
        hasActiveContract: active !== null,
        activeContractId: active?.id ?? null,
        activePlanName: active?.planName ?? null,
        activeEndsAt: active?.endsAt ?? null,
        daysUntilExpiry: active ? active.daysUntilExpiry() : null,
        totalContracts: contracts.length,
        outstanding: Number(outstanding.toFixed(2)),
        overdueCount,
      },
    };
  }
}
