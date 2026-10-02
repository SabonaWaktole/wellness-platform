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
}

export interface OfferService {
  serviceId: string | null;
  nameSq: string;
  nameEn: string | null;
  descriptionSq: string | null;
  descriptionEn: string | null;
}

/** An offer as the deal page lists it. Slice 9 adds its number, document and later statuses. */
export interface OfferView {
  id: string;
  dealId: string;
  clientId: string;
  status: string;
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
