import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { NotificationService } from '../../notifications/application/NotificationService';
import { daysBetween } from '../../contracts/domain/calendarDay';
import { planRenewalReminder } from '../../contracts/domain/renewalReminders';
import { runDailyJob } from './dailyJob';

/**
 * Renewal reminders at the workspace's lead times, once each (FR-REN-01,
 * FR-REN-02, FR-REN-03, NFR-REL-01).
 *
 * This is the job that makes the contracts module worth having: expiry itself
 * is recorded by `ContractExpiryJob`, but by then the customer has already
 * lapsed. The value is in the weeks BEFORE that, while there is still a
 * conversation to have.
 *
 * Built on `runDailyJob`: each workspace's own "today" and Active contracts
 * selected by state, so a run after a gap catches up (D8). Of the lead times a
 * contract has reached and not yet had, the smallest is sent and the larger
 * ones are recorded SKIPPED. The row is written only AFTER the notification was
 * emitted, so a failed send leaves nothing behind and the next run retries; a
 * second run on the same day finds every row and sends nothing. A contract
 * marked Not renewing, a Suspended one, and one that already has a renewal are
 * never selected, and a renewal contract starts with no rows (FR-REN-03).
 */
export class ContractRenewalReminderJob implements ScheduledJob {
  readonly name = 'contract-renewal-reminder';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    let sent = 0;

    const { failedTenants } = await runDailyJob(this.queries, now, async ({ tenant, today }) => {
      const leadDays = await this.queries.getReminderLeadDays(tenant.id);
      if (leadDays.length === 0) return 0;

      let sentHere = 0;
      for (const contract of await this.queries.findContractsForReminder(tenant.id, today, Math.max(...leadDays))) {
        try {
          const daysLeft = daysBetween(today, contract.endsAt);
          const plan = planRenewalReminder({ leadDays, daysLeft, recorded: contract.recordedLeadDays });
          if (plan.send === null) continue;

          await this.notifications.emitStrict({
            tenantId: tenant.id,
            // The salesperson (the contract's, the company's, else whoever sold it) and the people who
            // manage contracts over the company at Team or All scope, by default the Sales Manager (FR-REN-02).
            recipientUserIds: [contract.assignedUserId ?? contract.clientAssignedUserId ?? contract.createdByUserId],
            toPermission: { key: 'contracts.manage', subjectOwnerId: contract.clientAssignedUserId },
            type: 'CONTRACT_EXPIRING',
            params: {
              clientName: contract.clientName,
              planName: contract.planName,
              number: contract.number ?? '',
              endsAt: contract.endsAt.toISOString().slice(0, 10),
              daysRemaining: daysLeft,
              leadDays: plan.send,
            },
            actorUserId: null,
            entityType: 'CONTRACT',
            entityId: contract.id,
          });

          // Recorded only once the emit returned: a thrown send must leave no row, so it is retried.
          await this.queries.recordContractReminders(
            contract,
            [{ leadDays: plan.send, state: 'SENT' }, ...plan.skip.map((skipped) => ({ leadDays: skipped, state: 'SKIPPED' as const }))],
            now
          );
          sentHere += 1;
        } catch (error) {
          console.error(`Scheduler: could not remind about contract ${contract.id}; retrying next run`, error);
        }
      }

      sent += sentHere;
      return sentHere;
    });

    return `${sent} renewal reminder(s) sent${failedTenants ? `, ${failedTenants} workspace(s) failed` : ''}`;
  }
}
