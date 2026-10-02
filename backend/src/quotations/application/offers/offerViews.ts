import { PriceOnRequestReason } from '../../../pricing/domain/PriceCalculator';
import { OfferLanguage, OfferServiceLine } from '../../domain/Offer';

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
