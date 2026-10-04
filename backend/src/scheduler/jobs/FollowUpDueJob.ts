import { ScheduledJob } from '../Scheduler';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { NotificationService } from '../../notifications/application/NotificationService';
import { IFollowUpSchedulerQueries } from '../../appointments/application/followUps/ports/IFollowUpSchedulerQueries';

/**
 * How far back a sweep looks. A follow-up that came due while the worker was
 * down is still announced when it restarts, up to a day late; older ones are
 * already red in "My follow-ups", and a burst of stale notices after an
 * outage would only bury the current ones.
 */
const CATCH_UP_MS = 24 * 60 * 60 * 1000;

/**
 * FR-FUP-09: the salesperson is notified in the app when a follow-up comes
 * due. Every five minutes, workspace by workspace, as AppointmentReminderJob:
 * a notice up to five minutes after the due time reads as on time.
 *
 * Claim first, then notify (see AppointmentReminderJob): the claim is a
 * conditional update, so two sweeps, or a sweep and a reschedule, can never
 * both announce the same due time.
 */
export class FollowUpDueJob implements ScheduledJob {
  readonly name = 'follow-up-due';
  readonly intervalMs = 5 * 60_000;

  constructor(
    private readonly queries: IFollowUpSchedulerQueries,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    let sent = 0;
    for (const settings of await this.settingsRepo.listAll()) {
      if (!settings.followUpDueNotificationsEnabled) continue;
      const due = await this.queries.dueWithoutNotice(settings.tenantId, new Date(now.getTime() - CATCH_UP_MS), now);
      for (const followUp of due) {
        if (!(await this.queries.claimDueNotice(followUp.tenantId, followUp.id, followUp.scheduledAt, now))) continue;
        await this.notifications.emitSafe({
          tenantId: followUp.tenantId,
          recipientUserIds: [followUp.assignedUserId],
          type: 'FOLLOW_UP_DUE',
          params: {
            clientName: followUp.clientName,
            scheduledAt: followUp.scheduledAt.toISOString(),
            followUpType: followUp.type,
            ...(followUp.notes ? { note: followUp.notes } : {}),
          },
          // No actor: the clock did this.
          actorUserId: null,
          entityType: 'FOLLOW_UP',
          entityId: followUp.id,
        });
        sent += 1;
      }
    }
    return `${sent} follow-up due notice(s) sent`;
  }
}
