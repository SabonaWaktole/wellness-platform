import { ScheduledJob } from '../Scheduler';
import { ISchedulerQueries } from '../ISchedulerQueries';
import { INotificationSettingsRepository } from '../../notifications/domain/INotificationSettingsRepository';
import { ExpireQuotationUseCase } from '../../quotations/application/use-cases/ExpireQuotationUseCase';
import { ExpireOfferUseCase } from '../../quotations/application/offers/ExpireOfferUseCase';
import { dayKeyInZone } from '../../shared/domain/time/tenantDay';

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
 *
 * A workspace on the sales process (D6) is swept differently (FR-OFR-13): its
 * sent offers expire once their own validity date has passed in the
 * workspace's time zone, whatever the legacy switch says, since the validity
 * is part of the offer's terms (Q9). Its legacy quotations are left alone.
 */
export class QuotationExpiryJob implements ScheduledJob {
  readonly name = 'quotation-expiry';
  readonly intervalMs = 60 * 60_000;

  constructor(
    private readonly queries: ISchedulerQueries,
    private readonly settingsRepo: INotificationSettingsRepository,
    private readonly expireQuotation: ExpireQuotationUseCase,
    private readonly expireOffer: ExpireOfferUseCase
  ) {}

  async run(now: Date): Promise<string> {
    let expired = 0;
    const salesProcess = await this.queries.listSalesProcessTenants();
    for (const tenant of salesProcess) {
      const due = await this.queries.findOffersPastValidity(tenant.id, dayKeyInZone(now, tenant.timeZone));
      for (const offer of due) {
        try {
          if (await this.expireOffer.execute({ tenantId: offer.tenantId, offerId: offer.id, now })) expired += 1;
        } catch (error) {
          console.error(`Scheduler: could not expire offer ${offer.id}`, error);
        }
      }
    }

    const skip = new Set(salesProcess.map((tenant) => tenant.id));
    const allSettings = await this.settingsRepo.listAll();
    for (const settings of allSettings) {
      if (!settings.quotationAutoExpireEnabled || skip.has(settings.tenantId)) continue;

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
