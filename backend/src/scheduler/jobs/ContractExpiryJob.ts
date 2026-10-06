import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { ExpireContractUseCase } from '../../contracts/application/use-cases/ExpireContractUseCase';
import { NotificationService } from '../../notifications/application/NotificationService';
import { runDailyJob } from './dailyJob';

/** How long a notice that failed is retried before it is given up on. */
const NOTICE_RETRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Automatic contract expiry (FR-CON-16, NFR-REL-01).
 *
 * No per-tenant opt-in: a term reaching its end date is a fact about the
 * calendar, not a policy decision. Built on `runDailyJob`: each workspace's own
 * "today", contracts selected by state (Active with an end date before today),
 * so a run after a gap catches up, and the actor is the system.
 *
 * Goes through `ExpireContractUseCase` so the transition guard, the history
 * row, the audit entry and the company's status stay in one place. The
 * notification is written after that transaction commits. A failed one does not
 * undo the expiry and is retried on the next run: a contract is "told" once a
 * CONTRACT_EXPIRED notification exists for it, so a second run adds nothing.
 * Nobody is told when a renewal contract or an open renewal deal exists.
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
    let notified = 0;

    const { processed, failedTenants } = await runDailyJob(this.queries, now, async ({ tenant, today }) => {
      let expired = 0;

      for (const { id } of await this.queries.findContractsPastEnd(tenant.id, today)) {
        try {
          if (await this.expireContract.execute({ tenantId: tenant.id, contractId: id, today, now })) expired += 1;
        } catch (error) {
          // Per-contract isolation. The likely failure is a race — somebody cancelled
          // or renewed the contract after the sweep read it. That is the guard working.
          console.error(`Scheduler: could not expire contract ${id}`, error);
        }
      }

      const since = new Date(today.getTime() - NOTICE_RETRY_DAYS * DAY_MS);
      for (const contract of await this.queries.findExpiredAwaitingNotice(tenant.id, since)) {
        try {
          await this.notifications.emitStrict({
            tenantId: tenant.id,
            // The salesperson (the contract's, the company's, else whoever sold it)
            // and the people who manage contracts over the company, Team or All (FR-CON-16).
            recipientUserIds: [contract.assignedUserId ?? contract.clientAssignedUserId ?? contract.createdByUserId],
            toPermission: { key: 'contracts.manage', subjectOwnerId: contract.clientAssignedUserId },
            type: 'CONTRACT_EXPIRED',
            params: {
              clientName: contract.clientName,
              planName: contract.planName,
              number: contract.number ?? '',
              endsAt: contract.endsAt.toISOString().slice(0, 10),
            },
            actorUserId: null,
            entityType: 'CONTRACT',
            entityId: contract.id,
          });
          notified += 1;
        } catch (error) {
          console.error(`Scheduler: could not notify about expired contract ${contract.id}; retrying next run`, error);
        }
      }

      return expired;
    });

    return `${processed} contract(s) expired, ${notified} notified${failedTenants ? `, ${failedTenants} workspace(s) failed` : ''}`;
  }
}
