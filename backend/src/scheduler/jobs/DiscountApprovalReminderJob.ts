import { ScheduledJob } from '../Scheduler';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { NotificationService } from '../../notifications/application/NotificationService';
import { IDiscountApprovalStore } from '../../discounts/application/ports/IDiscountApprovalStore';
import { APPROVE_DISCOUNTS } from '../../quotations/application/offers/offerAccess';
import { approvalRequestParams } from '../../quotations/application/offers/approvalNotices';

/**
 * One reminder for a discount approval that has waited longer than the
 * workspace's configured hours (FR-DSC-12, default 24, Settings →
 * Notifications). Runs hourly; mark-first-then-notify, so a crash between
 * the two misses one reminder instead of looping one (see
 * AppointmentReminderJob for why that order is the safe one).
 */
export class DiscountApprovalReminderJob implements ScheduledJob {
  readonly name = 'discount-approval-reminders';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly store: IDiscountApprovalStore,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly notifications: NotificationService
  ) {}

  async run(now: Date): Promise<string> {
    const allSettings = await this.settingsRepo.listAll();
    let sent = 0;

    for (const settings of allSettings) {
      const due = await this.store.pendingReminderViews(settings.tenantId, settings.discountApprovalReminderHours, now);
      for (const view of due) {
        try {
          const approval = await this.store.find(settings.tenantId, view.id);
          if (!approval || !approval.needsReminder(settings.discountApprovalReminderHours, now)) continue;
          approval.markReminded(now);
          await this.store.save(approval);

          await this.notifications.emitSafe({
            tenantId: settings.tenantId,
            // The requester is never reminded of their own request (FR-DSC-09).
            toPermission: { key: APPROVE_DISCOUNTS, subjectOwnerId: view.dealOwnerUserId, excludeUserId: view.requestedByUserId },
            type: 'DISCOUNT_APPROVAL_REMINDER',
            params: approvalRequestParams({
              kind: view.kind,
              reference: view.reference,
              clientName: view.companyName,
              salespersonName: view.requestedByName,
              reason: view.reason,
              requestedPercent: view.requestedPercent,
              listPrice: view.listPriceAtRequest,
              requestedMonthlyPrice: view.requestedMonthlyPrice,
              offerId: view.offerId,
              dealId: view.dealId,
            }),
            actorUserId: null,
            entityType: 'OFFER',
            entityId: view.dealId,
          });
          sent += 1;
        } catch (error) {
          console.error(`Scheduler: could not remind discount approval ${view.id}`, error);
        }
      }
    }

    return `${sent} discount approval reminder(s) sent`;
  }
}
