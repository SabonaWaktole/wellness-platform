import { PriceOnRequestReason } from '../../../pricing/domain/PriceCalculator';
import { OfferLanguage, OfferServiceLine } from '../../domain/Offer';

/** The steps the offer view offers, each gated on the server (FR-OFR-09..12, FR-DSC-06, 10). */
export type OfferAction =
  | 'EDIT'
  | 'MARK_READY'
  | 'MARK_SENT'
  | 'MARK_ACCEPTED'
  | 'MARK_REJECTED'
  | 'REVISE'
  | 'APPROVE_DISCOUNT'
  | 'REJECT_DISCOUNT'
  | 'WITHDRAW_APPROVAL';

/** The offer's pending approval, if it waits for one (FR-DSC-03, FR-PRC-09). */
export interface PendingApprovalSummary {
  id: string;
  requestedByUserId: string;
  requestedByName: string;
  /** A discount above the cap, or a manual price on "Price on request". */
  kind: 'DISCOUNT' | 'MANUAL_PRICE';
  /** DISCOUNT only. */
  requestedPercent: string | null;
  /** DISCOUNT only. */
  listPriceAtRequest: string | null;
  /** MANUAL_PRICE only. */
  requestedMonthlyPrice: string | null;
  reason: string;
  createdAt: string;
}

/**
 * An offer as the deal page shows it (FR-DEAL-03, FR-OFR-04). Amounts are
 * strings with two decimals (NFR-ACC-02), under the names `redactFields`
 * guards, so a viewer without `commercial.view` never receives them
 * (FR-RBAC-17). NULL amounts: a "Price on request" draft.
 */
export interface OfferView {
  id: string;
  dealId: string;
  clientId: string;
  status: string;
  /** OF-2026-0001, the same on every version (FR-OFR-08). */
  number: string | null;
  version: number;
  /** What every screen shows: OF-2026-0001, or OF-2026-0001 v2 (FR-OFR-11). */
  reference: string;
  previousVersionId: string | null;
  /** A later version replaces this one: read-only, still downloadable (FR-OFR-11). */
  superseded: boolean;
  readyAt: string | null;
  sentAt: string | null;
  /** The last day the offer is valid, YYYY-MM-DD (FR-OFR-10). */
  validUntil: string | null;
  respondedAt: string | null;
  /** The note of the latest status change, e.g. why it was rejected (FR-OFR-12). */
  statusNote: string | null;
  contactPersonId: string | null;
  companyName: string;
  dealTitle: string | null;
  dealOwnerUserId: string;
  dealOwnerName: string;
  /** The deal is not won, lost or deleted: its offers can still change. */
  dealOpen: boolean;
  /** What this viewer may do with the offer now (FR-OFR-09); filled by the use case. */
  permittedActions: OfferAction[];
  /** The pending discount approval, when the offer waits for one (FR-DSC-03). */
  pendingApproval: PendingApprovalSummary | null;
  /**
   * The latest approved above-cap discount (FR-DSC-08). It still covers the
   * offer while the list price stays the same and the discount is not raised
   * above `approvedPercent`, so the pricing screen asks for no new approval.
   */
  approvedDiscount: { listPriceAtRequest: string; approvedPercent: string } | null;
  /** FR-PRC-09: a manual monthly price on a "Price on request" offer, and why. */
  manualMonthlyPrice: string | null;
  manualPriceReason: string | null;
  language: OfferLanguage;
  note: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  employeesPriced: number | null;
  packageId: string | null;
  frequencyId: string | null;
  zoneId: string | null;
  /** The inputs with their sq/en labels, as priced (D2). */
  pricingInputs: Record<string, unknown> | null;
  /** The rule values used (D2, FR-PCF-10). */
  ruleSnapshot: Record<string, unknown> | null;
  priceOnRequest: PriceOnRequestReason | null;
  services: OfferServiceLine[];
  baseFee: string | null;
  riskFee: string | null;
  visitFee: string | null;
  locationFee: string | null;
  listPrice: string | null;
  discountPercent: string | null;
  discountAmount: string | null;
  netMonthlyPrice: string | null;
  pricePerEmployee: string | null;
  annualValue: string | null;
}

/** One page of the offers list (FR-OFR-14). */
export interface OfferPage {
  data: OfferView[];
  total: number;
  page: number;
  pageSize: number;
}
