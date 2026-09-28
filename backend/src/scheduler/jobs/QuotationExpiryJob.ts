import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { ExpireQuotationUseCase } from '../../quotations/application/use-cases/ExpireQuotationUseCase';

/**
 * Automatic quotation expiry (§6.5).
 *
 * The SRS lists Expired as a quotation status but never says a human presses a
 * button to get there; the endpoint that existed was manual-only, so in
 * practice nothing ever expired. This closes that.
 *
 * Off by default (see NotificationSettings.defaults) because unlike the other
 * two jobs it *changes business records* rather than sending a message. An
 * owner should switch that on knowing it will happen.
 *
 * Note this goes through `ExpireQuotationUseCase` rather than issuing its own
 * UPDATE. The use case owns the transition guard, the status-history row and
 * the notification; a direct write would produce an EXPIRED quotation whose own
 * history could not explain how it got there — the exact defect
 * IQuotationWriteTransaction was introduced to fix.
 */
export class QuotationExpiryJob implements ScheduledJob {
  readonly name = 'quotation-expiry';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly expireQuotation: ExpireQuotationUseCase
  ) {}

  async run(now: Date): Promise<string> {
    const allSettings = await this.settingsRepo.listAll();
    let expired = 0;

    for (const settings of allSettings) {
      if (!settings.quotationAutoExpireEnabled) continue;

      const due = await this.queries.findQuotationsDueExpiry(
        settings.tenantId,
        now,
        settings.quotationExpiryDays
      );

      for (const quotation of due) {
        try {
          await this.expireQuotation.execute({
            tenantId: quotation.tenantId,
            quotationId: quotation.id,
            // NULL on both: the scheduler is not a person. The history row
            // records that honestly, and a null actor means the creator is
            // still notified rather than being treated as the one who did it.
            actingUserId: null,
            access: null,
          });
          expired += 1;
        } catch (error) {
          /*
           * Per-quotation isolation. The likely failure is a race — somebody
           * accepted the quotation between the sweep's SELECT and this call,
           * so `expire()` refuses the transition. That is the guard working,
           * not an error worth stopping the batch for.
           */
          console.error(`Scheduler: could not expire quotation ${quotation.id}`, error);
        }
      }
    }

    return `${expired} quotation(s) expired`;
  }
}
