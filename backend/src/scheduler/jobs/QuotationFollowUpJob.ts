import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { NotificationService } from '../../notifications/application/NotificationService';
import { quotationReference } from '../../quotations/domain/quotationReference';

/**
 * Follow-up reminders on unanswered quotations (§6.6).
 *
 * "Automated reminder when a sent quotation has not received a response within
 * a defined period", the period being configurable per business.
 *
 * The reminder goes to the person who created the quotation, not to the client.
 * §6.6 puts this feature under "helps sales representatives stay on top of
 * outstanding quotations" — it is a nudge to chase, not an automated chase.
 * Mailing the customer on a timer is a different product decision and is not
 * what the SRS asks for.
 *
 * Hourly, not per-minute: the unit of the setting is days.
 */
export class QuotationFollowUpJob implements ScheduledJob {
  readonly name = 'quotation-follow-ups';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    const allSettings = await this.settingsRepo.listAll();
    // Under the sales process, follow-ups are planned by hand (Slice 11).
    const salesProcess = new Set((await this.queries.listSalesProcessTenants()).map((tenant) => tenant.id));
    let sent = 0;

    for (const settings of allSettings) {
      if (!settings.quotationFollowUpEnabled || salesProcess.has(settings.tenantId)) continue;

      const stale = await this.queries.findQuotationsNeedingFollowUp(
        settings.tenantId,
        now,
        settings.quotationFollowUpDays
      );

      for (const quotation of stale) {
        // Marked before notifying, for the reason AppointmentReminderJob
        // documents: a duplicate chase is worse than a missed one.
        await this.queries.markQuotationFollowedUp(quotation.id, now);

        const daysWaiting = Math.floor(
          (now.getTime() - quotation.sentAt.getTime()) / (24 * 60 * 60_000)
        );

        await this.notifications.emitSafe({
          tenantId: quotation.tenantId,
          recipientUserIds: [quotation.createdByUserId],
          type: 'QUOTATION_FOLLOW_UP',
          params: {
            reference: quotationReference(quotation),
            clientName: quotation.clientName,
            daysWaiting,
          },
          actorUserId: null,
          entityType: 'QUOTATION',
          entityId: quotation.id,
        });
        sent += 1;
      }
    }

    return `${sent} follow-up(s) sent`;
  }
}
