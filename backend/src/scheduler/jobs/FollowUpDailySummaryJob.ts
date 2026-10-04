import { ScheduledJob } from '../Scheduler';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { NotificationService } from '../../notifications/application/NotificationService';
import { IFollowUpSchedulerQueries } from '../../appointments/application/followUps/ports/IFollowUpSchedulerQueries';
import { dayBoundsInZone, dayKeyInZone, instantInZone } from '../../shared/domain/time/tenantDay';

/** 07:30 in the workspace's time zone (FR-FUP-09). */
const SUMMARY_HOUR = 7;
const SUMMARY_MINUTE = 30;

/**
 * FR-FUP-09: the optional daily summary of each salesperson's follow-ups,
 * when the workspace switched it on. Checked every five minutes; the first
 * sweep at or after 07:30 in the workspace's zone claims the day and sends.
 * The claim moves `followUpSummarySentOn` forward in one conditional update,
 * so a day is never summarised twice, and a worker restarted at 10:00 still
 * sends that morning's summary.
 *
 * The summary is an in-app notification whose email the summary switch
 * governs (NotificationSettings.emailsFor), so switching it on is enough.
 */
export class FollowUpDailySummaryJob implements ScheduledJob {
  readonly name = 'follow-up-daily-summary';
  readonly intervalMs = 5 * 60_000;

  constructor(
    private readonly queries: IFollowUpSchedulerQueries,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    let sent = 0;
    for (const settings of await this.settingsRepo.listAll()) {
      if (!settings.followUpDailySummaryEnabled) continue;
      const timeZone = await this.queries.timeZone(settings.tenantId);
      const day = dayKeyInZone(now, timeZone);
      // The wall clock, not start-of-day plus 7½ hours: a DST day is 23 or 25 hours long.
      if (now.getTime() < instantInZone(day, SUMMARY_HOUR, SUMMARY_MINUTE, timeZone).getTime()) continue;
      const { start, end } = dayBoundsInZone(timeZone, 0, now);
      if (!(await this.queries.claimSummaryDay(settings.tenantId, day))) continue;

      for (const summary of await this.queries.daySummaries(settings.tenantId, start, end)) {
        await this.notifications.emitSafe({
          tenantId: settings.tenantId,
          recipientUserIds: [summary.assignedUserId],
          type: 'FOLLOW_UP_DAILY_SUMMARY',
          params: { day, today: summary.today, overdue: summary.overdue },
          actorUserId: null,
        });
        sent += 1;
      }
    }
    return `${sent} follow-up summary(ies) sent`;
  }
}
