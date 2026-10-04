import { OfferRenderSnapshot } from '../document/OfferRenderSnapshot';

/** Who and what an offer's document names, as stored on the offer and its deal. */
export interface OfferDocumentSubject {
  clientId: string;
  /** NULL: the company's primary contact. */
  contactPersonId: string | null;
  /** The deal's salesperson (FR-OFR-02). */
  salespersonUserId: string;
}

/**
 * The details an offer's PDF shows, as they are now (D2): read for a draft's
 * preview, and frozen into the offer when it becomes Ready. Every method
 * takes `tenantId` first.
 */
export interface IOfferDocumentSource {
  current(tenantId: string, subject: OfferDocumentSubject): Promise<OfferRenderSnapshot>;
}
