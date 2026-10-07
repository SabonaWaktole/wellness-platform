import { Scheduler, ScheduledJob, SchedulerOptions } from './Scheduler';
import { RecordScopeResolver } from '../access/application/RecordScopeResolver';
import { PrismaTeamRoster } from '../access/infrastructure/PrismaTeamRoster';
import { PrismaDiscountApprovalStore } from '../discounts/infrastructure/PrismaDiscountApprovalStore';
import { DiscountApprovalReminderJob } from './jobs/DiscountApprovalReminderJob';
import { FollowUpDueJob } from './jobs/FollowUpDueJob';
import { FollowUpDailySummaryJob } from './jobs/FollowUpDailySummaryJob';
import { PrismaFollowUpSchedulerQueries } from '../appointments/infrastructure/followUps/PrismaFollowUpSchedulerQueries';
import { PrismaPermissionHolderDirectory } from '../notifications/infrastructure/PrismaPermissionHolderDirectory';
import { PrismaSchedulerQueries } from './PrismaSchedulerQueries';
import { AppointmentReminderJob } from './jobs/AppointmentReminderJob';
import { QuotationFollowUpJob } from './jobs/QuotationFollowUpJob';
import { QuotationExpiryJob } from './jobs/QuotationExpiryJob';
import { InvoiceOverdueJob } from './jobs/InvoiceOverdueJob';
import { ContractExpiryJob } from './jobs/ContractExpiryJob';
import { MarkPaymentsOverdueJob } from './jobs/MarkPaymentsOverdueJob';
import { MarkPaymentOverdueUseCase } from '../contracts/application/use-cases/MarkPaymentOverdueUseCase';
import { ContractRenewalReminderJob } from './jobs/ContractRenewalReminderJob';
import { MemberTermJob } from './jobs/MemberTermJob';
import { ExpireMemberTermsUseCase } from '../membership/application/use-cases/MemberTermUseCases';
import { PrismaMemberTermJobStore } from '../membership/infrastructure/PrismaMemberTermJobStore';
import { PrismaMembershipSettingsStore } from '../membership/infrastructure/PrismaMembershipSettingsStore';
import { PrismaMembershipWriteTransaction } from '../membership/infrastructure/PrismaMembershipWriteTransaction';

import { PrismaUserRepository } from '../auth/infrastructure/repositories/PrismaUserRepository';
import { PrismaTenantRepository } from '../tenant/infrastructure/repositories/PrismaTenantRepository';
import { SmtpEmailSender } from '../auth/infrastructure/SmtpEmailSender';
import { PrismaNotificationRepository } from '../notifications/infrastructure/PrismaNotificationRepository';
import { PrismaNotificationSettingsRepository } from '../notifications/infrastructure/PrismaNotificationSettingsRepository';
import { NotificationService } from '../notifications/application/NotificationService';
import { NotificationEmailComposer } from '../notifications/application/NotificationEmailComposer';
import { NotificationEmailDispatcher } from '../notifications/application/NotificationEmailDispatcher';
import { PrismaQuotationWriteTransaction } from '../quotations/infrastructure/PrismaQuotationWriteTransaction';
import { ExpireQuotationUseCase } from '../quotations/application/use-cases/ExpireQuotationUseCase';
import { ExpireOfferUseCase } from '../quotations/application/offers/ExpireOfferUseCase';
import { PrismaOfferWriteTransaction } from '../quotations/infrastructure/offers/PrismaOfferWriteTransaction';
import { PrismaInvoiceWriteTransaction } from '../invoices/infrastructure/PrismaInvoiceWriteTransaction';
import { MarkInvoiceOverdueUseCase } from '../invoices/application/use-cases/MarkInvoiceOverdueUseCase';
import { PrismaContractWriteTransaction } from '../contracts/infrastructure/PrismaContractWriteTransaction';
import { ExpireContractUseCase } from '../contracts/application/use-cases/ExpireContractUseCase';

/**
 * Builds the background worker.
 *
 * Kept out of `createApp` deliberately. `createApp` is instantiated by every
 * integration test and by any script that imports the HTTP layer; a scheduler
 * built there would start timers in all of them, and sweeps would fire against
 * whatever database the test happened to be pointed at. The web process and the
 * worker share repositories and use cases but not a composition root.
 */
export function createScheduler(options: SchedulerOptions = {}): Scheduler {
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
    new SmtpEmailSender(),
    new NotificationEmailComposer(appUrl)
  );

  // The reminder and follow-up jobs are not inside a transaction, so they use
  // `emitSafe`, which writes the notification and sends the email in one step.
  // The directory lets the discount reminder fan out by permission (D9).
  const notifications = new NotificationService(
    notificationRepository,
    userRepository,
    emailDispatcher,
    new PrismaPermissionHolderDirectory(undefined, new PrismaTeamRoster())
  );

  const expireQuotation = new ExpireQuotationUseCase(
    new PrismaQuotationWriteTransaction(),
    userRepository,
    // The job acts as the system (access: null), which no scope narrows.
    new RecordScopeResolver(new PrismaTeamRoster()),
    emailDispatcher
  );

  const followUpQueries = new PrismaFollowUpSchedulerQueries();

  const markInvoiceOverdue = new MarkInvoiceOverdueUseCase(new PrismaInvoiceWriteTransaction());

  const expireContract = new ExpireContractUseCase(new PrismaContractWriteTransaction());

  const jobs: ScheduledJob[] = [
    new AppointmentReminderJob(queries, settingsRepository, notifications),
    new QuotationFollowUpJob(queries, settingsRepository, notifications),
    new QuotationExpiryJob(queries, settingsRepository, expireQuotation, new ExpireOfferUseCase(new PrismaOfferWriteTransaction())),
    new DiscountApprovalReminderJob(new PrismaDiscountApprovalStore(), settingsRepository, notifications),
    new FollowUpDueJob(followUpQueries, settingsRepository, notifications),
    new FollowUpDailySummaryJob(followUpQueries, settingsRepository, notifications),
    new InvoiceOverdueJob(queries, markInvoiceOverdue),
    new ContractExpiryJob(queries, expireContract, notifications),
    new MarkPaymentsOverdueJob(queries, new MarkPaymentOverdueUseCase(new PrismaContractWriteTransaction()), notifications),
    new ContractRenewalReminderJob(queries, notifications),
    new MemberTermJob(
      queries,
      new PrismaMemberTermJobStore(),
      new PrismaMembershipSettingsStore(),
      new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction()),
      notifications
    ),
  ];

  return new Scheduler(jobs, options);
}
