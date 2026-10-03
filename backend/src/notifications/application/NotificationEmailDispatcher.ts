import { Notification } from '../domain/Notification';
import { INotificationSettingsRepository } from '../domain/INotificationSettingsRepository';
import { NotificationEmailComposer } from './NotificationEmailComposer';
import { IUserRepository } from '../../auth/domain/repositories/IUserRepository';
import { ITenantRepository } from '../../tenant/domain/repositories/ITenantRepository';
import { IEmailSender } from '../../auth/application/ports/IEmailSender';

/**
 * Sends the email half of a notification (§6.6).
 *
 * Deliberately a separate object from `NotificationService` rather than a
 * method on it. The service runs inside database transactions — six quotation
 * use cases call it from within `IQuotationWriteTransaction.run` — and an SMTP
 * call inside a transaction would hold a database connection open for the
 * duration of a network round trip to a third party. Worse, it would send mail
 * describing a change that might still roll back.
 *
 * So the split follows the commit boundary: the service writes rows, the caller
 * commits, and then `dispatch` runs against the notifications the service
 * returned. That ordering is what makes "no email for a rolled-back action"
 * true rather than merely likely.
 */
export class NotificationEmailDispatcher {
  constructor(
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly emailSender: IEmailSender,
    private readonly composer: NotificationEmailComposer
  ) {}

  /**
   * Best-effort by contract.
   *
   * Never throws and never returns a failure: by the time this runs the
   * business change is already committed and the in-app notification already
   * exists. A mail server outage must not surface as a failed quotation
   * approval, and there is nothing useful the caller could do with the error.
   */
  async dispatch(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;

    try {
      // Every notification in one batch shares a tenant — they come from a
      // single emit — so the settings and tenant reads happen once.
      const tenantId = notifications[0].tenantId;
      const settings = await this.settingsRepo.get(tenantId);

      const sendable = notifications.filter((n) => settings.emailsFor(n.type));
      if (sendable.length === 0) return;

      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) return;

      await Promise.all(
        sendable.map((notification) => this.sendOne(notification, settings, tenant))
      );
    } catch (error) {
      console.error('Notification email dispatch failed', error);
    }
  }

  private async sendOne(
    notification: Notification,
    settings: { emailsRole(type: any, role: string): boolean },
    tenant: { name: string; urlSlug: string; defaultLanguage?: string }
  ): Promise<void> {
    try {
      const recipient = await this.userRepo.findById(notification.recipientUserId);
      // Re-checked at send time rather than trusted from emit: a recipient can
      // be deactivated between the row being written and this running.
      if (!recipient || !recipient.isActive || !recipient.email) return;
      if (!settings.emailsRole(notification.type, recipient.role)) return;

      const { subject, html } = this.composer.compose({
        type: notification.type,
        params: notification.params,
        tenantName: tenant.name,
        tenantSlug: tenant.urlSlug,
        entityType: notification.entityType,
        entityId: notification.entityId,
        // The recipient's own language, else the workspace's (FR-DSC-05).
        language: recipient.language ?? tenant.defaultLanguage ?? null,
      });

      await this.emailSender.sendTransactionalEmail(recipient.email, subject, html);
    } catch (error) {
      // Per-recipient isolation: one bad address must not stop the rest of a
      // fan-out. `Promise.all` above would otherwise reject the whole batch.
      console.error('Failed to send notification email', {
        type: notification.type,
        error,
      });
    }
  }
}
