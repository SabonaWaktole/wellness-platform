import { PrismaClient } from '@prisma/client';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';
import { contractReference } from '../../../contracts/domain/contractReference';

/**
 * Contract validity: each contract's creation and status changes, under
 * `contracts.validity.view` so Reception sees them. `amount` is redacted
 * without `commercial.view`. Status-change notes are left out — the contract
 * page keeps its history a manager's record (presentContractDetail).
 */
export class PrismaContractTimelineSource implements TimelineSource {
  readonly category = 'CONTRACT' as const;
  readonly permission = 'contracts.validity.view';

  constructor(private prisma: PrismaClient) {}

  async load(tenantId: string, clientId: string): Promise<TimelineEntry[]> {
    const contracts = await this.prisma.contract.findMany({
      where: { tenantId, clientId },
      include: { statusHistory: { where: { tenantId } } },
    });

    return contracts.flatMap((contract) => {
      const reference = contractReference(contract.id);
      const created: TimelineEntry = {
        id: `contract:${contract.id}`,
        category: this.category,
        type: 'CONTRACT_CREATED',
        timestamp: contract.createdAt.toISOString(),
        actorId: contract.createdByUserId,
        details: {
          contractId: contract.id,
          reference,
          planName: contract.planName,
          startsAt: contract.startsAt.toISOString(),
          endsAt: contract.endsAt.toISOString(),
          billingPeriod: contract.billingPeriod,
          amount: contract.amount,
        },
      };
      const changes: TimelineEntry[] = contract.statusHistory.map((change) => ({
        id: `contract-status:${change.id}`,
        category: this.category,
        type: 'CONTRACT_STATUS_CHANGED',
        timestamp: change.createdAt.toISOString(),
        actorId: change.changedByUserId,
        details: {
          contractId: contract.id,
          reference,
          planName: contract.planName,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
        },
      }));
      return [created, ...changes];
    });
  }
}
