import { RecordScope } from '../../../../access/domain/RecordScope';
import { OfferRenderSnapshot } from '../document/OfferRenderSnapshot';
import { OfferPage, OfferView } from '../offerViews';

/** The offers list's filters (FR-OFR-14). Dates are YYYY-MM-DD, on the creation date. */
export interface OfferFilters {
  statuses?: string[];
  ownerUserId?: string;
  clientId?: string;
  /** Part of the company's name or of the offer number. */
  query?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** Reads of offers. Every method takes `tenantId` first. */
export interface IOfferStore {
  /** A deal's offers, newest first (FR-DEAL-03); the deal's scope is checked by the caller. */
  forDeal(tenantId: string, dealId: string): Promise<OfferView[]>;
  /** One offer; its deal's scope is checked by the caller. */
  find(tenantId: string, id: string): Promise<OfferView | null>;
  /** The details frozen when the offer became Ready (D2), or null for a draft. */
  frozenDetails(tenantId: string, id: string): Promise<OfferRenderSnapshot | null>;
  /**
   * The offers whose deal's salesperson `scope` admits, newest first
   * (FR-OFR-14). The scope is in the query, so counts and pages stay right.
   */
  list(tenantId: string, scope: RecordScope, filters: OfferFilters, page: number, pageSize: number): Promise<OfferPage>;
}
