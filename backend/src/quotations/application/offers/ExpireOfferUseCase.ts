import { SYSTEM_ACTOR } from '../../../audit/domain/AuditEntry';
import { QuotationStatus } from '../../domain/Quotation';
import { recordOfferChange } from './offerChanges';
import { IOfferWriteTransaction } from './ports/IOfferWriteTransaction';

/**
 * SENT → EXPIRED, by the scheduler, once the validity date has passed in the
 * workspace's time zone (FR-OFR-13). The caller found the offer; this checks
 * again on the transaction, so an offer answered in between is left alone.
 * Returns whether it expired the offer.
 */
export class ExpireOfferUseCase {
  constructor(private readonly writeTx: IOfferWriteTransaction) {}

  async execute(input: { tenantId: string; offerId: string; now: Date }): Promise<boolean> {
    return this.writeTx.run(async (repos) => {
      const offer = await repos.offers.find(input.tenantId, input.offerId);
      if (!offer || offer.isSuperseded || offer.status !== QuotationStatus.Sent) return false;
      offer.expire(input.now);
      await repos.offers.saveStatus(offer);
      await recordOfferChange(repos, offer, QuotationStatus.Sent, SYSTEM_ACTOR);
      return true;
    });
  }
}
