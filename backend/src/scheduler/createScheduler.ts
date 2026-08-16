import { Scheduler, ScheduledJob } from './Scheduler';
import { PrismaSchedulerQueries } from './PrismaSchedulerQueries';
import { AppointmentReminderJob } from './jobs/AppointmentReminderJob';
import { QuotationFollowUpJob } from './jobs/QuotationFollowUpJob';
import { QuotationExpiryJob } from './jobs/QuotationExpiryJob';
import { InvoiceOverdueJob } from './jobs/InvoiceOverdueJob';

import { PrismaUserRepository } from '../auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaTenantRepository } from '../tenant/infrastructure/repositories/PrismaTenantRepository';
import { EmailJsSender } from '../auth/infrastructure/EmailJsSender';
import { PrismaNotificationRepository } from '../notifications/infrastructure/PrismaNotificationRepository';
import { PrismaNotificationSettingsRepository } from '../notifications/infrastructure/PrismaNotificationSettingsRepository';
import { NotificationService } from '../notifications/application/NotificationService';
import { NotificationEmailComposer } from '../notifications/application/NotificationEmailComposer';
import { NotificationEmailDispatcher } from '../notifications/application/NotificationEmailDispatcher';
import { PrismaQuotationWriteTransaction } from '../quotations/infrastructure/PrismaQuotationWriteTransaction';
import { ExpireQuotationUseCase } from '../quotations/application/use-cases/ExpireQuotationUseCase';
import { PrismaInvoiceWriteTransaction } from '../invoices/infrastructure/PrismaInvoiceWriteTransaction';
import { MarkInvoiceOverdueUseCase } from '../invoices/application/use-cases/MarkInvoiceOverdueUseCase';

/**
 * Builds the background worker.
 *
 * Kept out of `createApp` deliberately. `createApp` is instantiated by every
 * integration test and by any script that imports the HTTP layer; a scheduler
 * built there would start timers in all of them, and sweeps would fire against
 * whatever database the test happened to be pointed at. The web process and the
 * worker share repositories and use cases but not a composition root.
 */
export function createScheduler(): Scheduler {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const userRepository = new PrismaUserRepository();
  const tenantRepository = new PrismaTenantRepository();
  const notificationRepository = new PrismaNotificationRepository();
  const settingsRepository = new PrismaNotificationSettingsRepository();
  const queries = new PrismaSchedulerQueries();

  const emailDispatcher = new NotificationEmailDispatcher(
    settingsRepository,
    userRepository,
    tenantRepository,
    new EmailJsSender(),
    new NotificationEmailComposer(appUrl)
  );

  // The reminder and follow-up jobs are not inside a transaction, so they use
  // `emitSafe`, which writes the notification and sends the email in one step.
  const notifications = new NotificationService(
    notificationRepository,
    userRepository,
    emailDispatcher
  );

  const expireQuotation = new ExpireQuotationUseCase(
    new PrismaQuotationWriteTransaction(),
    userRepository,
    emailDispatcher
  );

  const markInvoiceOverdue = new MarkInvoiceOverdueUseCase(new PrismaInvoiceWriteTransaction());

  const jobs: ScheduledJob[] = [
    new AppointmentReminderJob(queries, settingsRepository, notifications),
    new QuotationFollowUpJob(queries, settingsRepository, notifications),
    new QuotationExpiryJob(queries, settingsRepository, expireQuotation),
    new InvoiceOverdueJob(queries, markInvoiceOverdue),
  ];

  return new Scheduler(jobs);
}
