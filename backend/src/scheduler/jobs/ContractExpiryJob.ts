import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { ExpireContractUseCase } from '../../contracts/application/use-cases/ExpireContractUseCase';
import { NotificationService } from '../../notifications/application/NotificationService';

/**
 * Automatic contract expiry.
 *
 * Shaped like `InvoiceOverdueJob` rather than `QuotationExpiryJob`: there is no
 * per-tenant opt-in, because a term reaching its end date is a fact about the
 * calendar, not a policy decision. A business that wants the subscription to
 * continue renews it; leaving a finished term marked ACTIVE would make "who is
 * currently subscribed" wrong for everybody who reads it.
 *
 * Goes through `ExpireContractUseCase` rather than a direct UPDATE so the
 * transition guard and the status-history row stay in one place — an EXPIRED
 * contract's own history can then explain that time expired it.
 */
export class ContractExpiryJob implements ScheduledJob {
  readonly name = 'contract-expiry';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly expireContract: ExpireContractUseCase,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    const pastEnd = await this.queries.findContractsPastEnd(now);
    let expired = 0;

    for (const contract of pastEnd) {
      try {
        await this.expireContract.execute({
          tenantId: contract.tenantId,
          contractId: contract.id,
        });
        expired += 1;

        await this.notifications.emitSafe({
          tenantId: contract.tenantId,
          // The account owner, falling back to whoever sold it. A contract
          // whose assignee was cleared still has to reach somebody — silence
          // here means a lapsed customer nobody chases.
          recipientUserIds: [contract.assignedUserId ?? contract.createdByUserId],
          type: 'CONTRACT_EXPIRED',
          params: {
            clientName: contract.clientName,
            planName: contract.planName,
            endsAt: contract.endsAt.toISOString().slice(0, 10),
          },
          actorUserId: null,
          entityType: 'CONTRACT',
          entityId: contract.id,
        });
      } catch (error) {
        /*
         * Per-contract isolation. The likely failure is a race — somebody
         * cancelled or renewed the contract between the sweep's SELECT and
         * this call, so `expire()` refuses the transition. That is the guard
         * working, not an error worth stopping the batch for.
         */
        console.error(`Scheduler: could not expire contract ${contract.id}`, error);
      }
    }

    return `${expired} contract(s) expired`;
  }
}
