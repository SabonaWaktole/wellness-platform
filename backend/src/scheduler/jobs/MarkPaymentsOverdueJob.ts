import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { MarkPaymentOverdueUseCase } from '../../contracts/application/use-cases/MarkPaymentOverdueUseCase';
import { NotificationService } from '../../notifications/application/NotificationService';
import { runDailyJob } from './dailyJob';

/**
 * Marks instalments Overdue and tells the right people once (FR-PAY-09,
 * FR-PAY-13, NFR-REL-01).
 *
 * Built on `runDailyJob`: each workspace's own "today", instalments selected by
 * state (invoiced or part paid, due date plus the workspace's grace days behind
 * us), so a run after a gap catches up, and the actor is the system. A Not
 * Invoiced instalment is never touched; it only carries the "Due, not
 * invoiced" flag when it is read.
 *
 * The change goes through `MarkPaymentOverdueUseCase` (history row and audit
 * entry in one transaction). The notification is a second step: the
 * instalment's `overdueNotifiedAt` is set only after the notice was emitted, so
 * a failure is retried on the next run and a second run adds nothing. A partly
 * paid instalment that was paid a little more and then flips to Overdue again
 * (D7) gets a new history row but no second notification.
 */
export class MarkPaymentsOverdueJob implements ScheduledJob {
  readonly name = 'payments-overdue';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly markOverdue: MarkPaymentOverdueUseCase,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    let notified = 0;

    const { processed, failedTenants } = await runDailyJob(this.queries, now, async ({ tenant, today }) => {
      let changed = 0;
      const graceDays = await this.queries.getPaymentGraceDays(tenant.id);

      for (const { id } of await this.queries.findPaymentsPastDue(tenant.id, today, graceDays)) {
        try {
          if (await this.markOverdue.execute({ tenantId: tenant.id, paymentId: id, today, graceDays, now })) changed += 1;
        } catch (error) {
          // Per-instalment isolation. The likely failure is a race with a receipt
          // recorded after the sweep read the row, which is the guard working.
          console.error(`Scheduler: could not mark payment ${id} overdue`, error);
        }
      }

      for (const payment of await this.queries.findOverdueAwaitingNotice(tenant.id)) {
        try {
          const salesperson = payment.assignedUserId ?? payment.clientAssignedUserId ?? payment.createdByUserId;
          const base = { tenantId: tenant.id, type: 'PAYMENT_OVERDUE' as const, actorUserId: null };
          // The authorised payment users and the responsible salesperson, plus the
          // Sales Manager: the holder of payments.view at Team scope over this
          // company (D12). Joined first so someone in two groups is told once.
          const recipients = new Set([
            ...(await this.notifications.recipientsFor({
              ...base,
              params: {},
              recipientUserIds: [salesperson],
              toPermission: { key: 'payments.update', subjectOwnerId: payment.clientAssignedUserId },
            })),
            ...(await this.notifications.recipientsFor({
              ...base,
              params: {},
              toPermission: { key: 'payments.view', subjectOwnerId: payment.clientAssignedUserId, onlyScope: 'TEAM' },
            })),
          ]);

          await this.notifications.emitStrict({
            ...base,
            recipientUserIds: [...recipients],
            params: {
              clientName: payment.clientName,
              planName: payment.planName,
              number: payment.number ?? '',
              instalment: payment.periodIndex,
              dueDate: payment.dueDate.toISOString().slice(0, 10),
            },
            entityType: 'CONTRACT',
            entityId: payment.contractId,
          });
          await this.queries.markPaymentOverdueNotified(payment.id, now);
          notified += 1;
        } catch (error) {
          console.error(`Scheduler: could not notify about overdue payment ${payment.id}; retrying next run`, error);
        }
      }

      return changed;
    });

    return `${processed} instalment(s) marked overdue, ${notified} notified${failedTenants ? `, ${failedTenants} workspace(s) failed` : ''}`;
  }
}
