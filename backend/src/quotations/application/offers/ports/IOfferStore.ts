import { OfferView } from '../offerViews';

/** Reads of offers. Every method takes `tenantId` first; the deal's scope is checked by the caller. */
export interface IOfferStore {
  /** A deal's offers, newest first (FR-DEAL-03). */
  forDeal(tenantId: string, dealId: string): Promise<OfferView[]>;
  find(tenantId: string, id: string): Promise<OfferView | null>;
}
