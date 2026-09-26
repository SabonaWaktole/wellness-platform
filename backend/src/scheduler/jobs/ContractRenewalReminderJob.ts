import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { NotificationService } from '../../notifications/application/NotificationService';

/**
 * How far ahead a renewal warning goes out.
 *
 * A fixed constant rather than a per-tenant setting, deliberately: the
 * NotificationSettings row already lets a workspace switch this type's EMAIL
 * off (`emailEventTypes`), which is the control people actually reach for. A
 * configurable lead time would be a schema change, a settings screen and a
 * migration to buy a number that thirty days serves for almost everyone — and
 * it can become one the day a tenant asks, without any of this moving.
 */
export const RENEWAL_LEAD_DAYS = 30;

/**
 * Warns the account owner that a subscription is about to run out.
 *
 * This is the job that makes the contracts module worth having: expiry itself
 * is recorded by `ContractExpiryJob`, but by then the customer has already
 * lapsed. The value is in the thirty days BEFORE that, while there is still a
 * conversation to have.
 *
 * Unlike the expiry sweep, this one changes no business record, so it needs
 * its own idempotency marker — `expiryNotifiedAt`, set only after the
 * notification has actually been emitted, so a failure mid-batch retries next
 * hour instead of going silent.
 */
export class ContractRenewalReminderJob implements ScheduledJob {
  readonly name = 'contract-renewal-reminder';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    const due = await this.queries.findContractsNearingExpiry(now, RENEWAL_LEAD_DAYS);
    let warned = 0;

    for (const contract of due) {
      try {
        const daysRemaining = Math.max(
          0,
          Math.ceil((contract.endsAt.getTime() - now.getTime()) / (24 * 60 * 60_000))
        );

        await this.notifications.emitSafe({
          tenantId: contract.tenantId,
          recipientUserIds: [contract.assignedUserId ?? contract.createdByUserId],
          type: 'CONTRACT_EXPIRING',
          params: {
            clientName: contract.clientName,
            planName: contract.planName,
            daysRemaining,
            endsAt: contract.endsAt.toISOString().slice(0, 10),
          },
          actorUserId: null,
          entityType: 'CONTRACT',
          entityId: contract.id,
        });

        // Marked only after the emit returns. `emitSafe` swallows its own
        // failures, so this is not a perfect guarantee — but the ordering is
        // still what stops a thrown query error from marking a contract warned
        // that nobody was warned about.
        await this.queries.markContractExpiryNotified(contract.id, now);
        warned += 1;
      } catch (error) {
        console.error(`Scheduler: could not warn about contract ${contract.id}`, error);
      }
    }

    return `${warned} contract renewal reminder(s) sent`;
  }
}
