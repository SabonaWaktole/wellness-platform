import type { PriceOnRequestReason } from '../services/pricingService';

/**
 * The pricing screen and the deal's offers (M2 Slice 8). Mirrors the
 * backend's PricingScreenView and OfferView. Every amount is a Decimal string
 * ("49.40") calculated on the server: the frontend only formats it and never
 * calculates a price (NFR-ACC-02). Amounts are absent altogether for a
 * viewer without `commercial.view` (FR-RBAC-17).
 */
export interface PricingLabel {
  id: string;
  nameSq: string;
  nameEn: string | null;
}

/** What the salesperson chooses; anything left out takes the company's value. */
export interface PricingChoices {
  employees?: number;
  businessTypeId?: string | null;
  zoneId?: string | null;
  frequencyId?: string | null;
  packageId?: string | null;
  discountPercent?: string;
}

export type PricingTarget = { dealId: string } | { clientId: string };

export type CompanyField = 'cityId' | 'businessTypeId';
export type PricingInputName = 'employees' | 'zoneId' | 'frequencyId';

export interface PricedResult {
  kind: 'PRICED';
  baseFee?: string;
  riskFee?: string;
  visitFee?: string;
  locationFee?: string;
  listPrice?: string;
  discountPercent?: string;
  discountAmount?: string;
  netMonthlyPrice?: string;
  pricePerEmployee?: string;
  annualValue?: string;
}

export type PricingResult =
  | PricedResult
  | { kind: 'PRICE_ON_REQUEST'; reason: PriceOnRequestReason }
  | { kind: 'COMPANY_INCOMPLETE'; missing: CompanyField[] }
  | { kind: 'INPUT_REQUIRED'; missing: PricingInputName[] };

export interface ActiveService extends PricingLabel {
  descriptionSq: string | null;
  descriptionEn: string | null;
}

export interface ActivePackage extends PricingLabel {
  descriptionSq: string | null;
  descriptionEn: string | null;
  isDefault: boolean;
  services: ActiveService[];
}

export interface PricingScreenView {
  subject: {
    clientId: string;
    companyName: string;
    dealId: string | null;
    dealOpen: boolean | null;
    employeeCount: number | null;
    businessTypeId: string | null;
    city: PricingLabel | null;
    area: PricingLabel | null;
  };
  inputs: {
    employees: number | null;
    businessTypeId: string | null;
    riskLevel: (PricingLabel & { level: number }) | null;
    zoneId: string | null;
    frequencyId: string | null;
    packageId: string | null;
    discountPercent?: string;
  };
  options: {
    zones: Array<PricingLabel & { surchargePercent?: string }>;
    frequencies: PricingLabel[];
    packages: ActivePackage[];
    discountCapPercent?: string;
  };
  result: PricingResult;
  discountAboveCap: boolean;
}

export interface SaveOfferInput extends PricingChoices {
  employees: number;
  businessTypeId: string;
  frequencyId: string;
  packageId: string;
  note: string | null;
  alsoUpdateCompany: boolean;
  /** FR-OFR-02: null for the company's primary contact; left out keeps the offer's. */
  contactPersonId?: string | null;
  /** FR-DSC-03, FR-PRC-09: why the discount is above the cap, or why the price is set by hand. */
  reason?: string | null;
  /** FR-PRC-09: a manual monthly price on "Price on request". */
  manualMonthlyPrice?: string | null;
}

/** What an approval is asked for: a discount above the cap, or a manual price (FR-PRC-09). */
export type ApprovalKind = 'DISCOUNT' | 'MANUAL_PRICE';

/** One row of the approver's pending list (FR-DSC-06). */
export interface PendingApprovalView {
  id: string;
  offerId: string;
  dealId: string;
  companyName: string;
  dealTitle: string | null;
  reference: string;
  dealOwnerUserId: string;
  dealOwnerName: string;
  requestedByUserId: string;
  requestedByName: string;
  kind: ApprovalKind;
  /** DISCOUNT only. */
  requestedPercent: string | null;
  /** DISCOUNT only. */
  listPriceAtRequest: string | null;
  /** MANUAL_PRICE only. */
  requestedMonthlyPrice: string | null;
  reason: string;
  createdAt: string;
}

export interface PendingApprovalPage {
  data: PendingApprovalView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OfferService {
  serviceId: string | null;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
}

/** The offer statuses (FR-OFR-09). */
export type OfferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'READY' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export const OFFER_STATUSES: readonly OfferStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'READY', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

/** What the server lets this viewer do with the offer now (FR-OFR-09..12, FR-DSC-06, 10). */
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

/** The offer's pending discount approval, when it waits for one (FR-DSC-03). */
export interface PendingApprovalSummary {
  id: string;
  requestedByUserId: string;
  requestedByName: string;
  kind: ApprovalKind;
  requestedPercent: string | null;
  listPriceAtRequest: string | null;
  requestedMonthlyPrice: string | null;
  reason: string;
  createdAt: string;
}

/** An offer as the deal page and the offers list show it (M2 Slices 8, 9). */
export interface OfferView {
  id: string;
  dealId: string;
  clientId: string;
  status: OfferStatus;
  /** OF-2026-0001, the same on every version (FR-OFR-08). */
  number: string | null;
  version: number;
  /** What to show: OF-2026-0001, or OF-2026-0001 v2. Never built on the frontend. */
  reference: string;
  previousVersionId: string | null;
  /** A later version replaces it: read-only, still downloadable (FR-OFR-11). */
  superseded: boolean;
  readyAt: string | null;
  sentAt: string | null;
  /** YYYY-MM-DD (FR-OFR-10). */
  validUntil: string | null;
  respondedAt: string | null;
  /** The latest status change's note, e.g. why it was rejected (FR-OFR-12). */
  statusNote: string | null;
  contactPersonId: string | null;
  companyName: string;
  dealTitle: string | null;
  dealOwnerUserId: string;
  dealOwnerName: string;
  dealOpen: boolean;
  permittedActions: OfferAction[];
  /** The pending discount approval, when the offer waits for one (FR-DSC-03). */
  pendingApproval: PendingApprovalSummary | null;
  /** FR-DSC-08: the latest approved discount; it covers the offer while the list price stays and the discount is not raised. */
  approvedDiscount?: { listPriceAtRequest: string; approvedPercent: string } | null;
  /** FR-PRC-09: a manual monthly price on "Price on request", and why. */
  manualMonthlyPrice?: string | null;
  manualPriceReason?: string | null;
  language: 'sq' | 'en';
  note: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  employeesPriced: number | null;
  packageId: string | null;
  frequencyId: string | null;
  zoneId: string | null;
  pricingInputs: {
    employees?: number;
    businessType?: PricingLabel | null;
    zone?: PricingLabel | null;
    frequency?: PricingLabel | null;
    package?: PricingLabel | null;
    discountPercent?: string;
  } | null;
  priceOnRequest: PriceOnRequestReason | null;
  services: OfferService[];
  listPrice?: string | null;
  discountPercent?: string | null;
  discountAmount?: string | null;
  netMonthlyPrice?: string | null;
  annualValue?: string | null;
}

/** One page of the offers list (FR-OFR-14). */
export interface OfferPage {
  data: OfferView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OfferListParams {
  status?: OfferStatus[];
  ownerUserId?: string;
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
}

/** The PDF's language, chosen at download (FR-OFR-06). */
export type OfferLanguage = 'sq' | 'en';
