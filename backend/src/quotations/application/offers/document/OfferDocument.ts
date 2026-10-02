import { RichTextDoc } from '../../../../shared/domain/richText';
import { OfferLanguage } from '../../../domain/Offer';

/**
 * The offer as its PDF shows it (FR-OFR-02, D3), in one language: every
 * value already chosen, so the renderer only draws. Labels and money
 * formatting are the renderer's; amounts are two-decimal strings
 * (NFR-ACC-02). There is no "Wellness price per person" (Q13).
 */
export interface OfferDocument {
  language: OfferLanguage;
  /** A draft carries the DRAFT watermark; Ready and later do not (FR-OFR-09). */
  draft: boolean;
  reference: string;
  /** The offer's date, YYYY-MM-DD: when it became Ready, or when this version was made. */
  issuedOn: string;
  /** Set once the offer is marked as sent (FR-OFR-10). */
  validUntil: string | null;
  /** Until then, the validity is this many days from the date sent. */
  validityDays: number | null;
  currency: string;
  issuer: {
    companyName: string | null;
    nipt: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    bankDetails: string | null;
  };
  company: {
    name: string;
    nipt: string | null;
    streetAddress: string | null;
    area: string | null;
    city: string | null;
  };
  contact: { name: string; position: string | null; phone: string | null; email: string | null } | null;
  inputs: {
    employees: number | null;
    businessType: string | null;
    riskLevel: string | null;
    zone: string | null;
    frequency: string | null;
    package: string | null;
  };
  services: { name: string; description: string | null }[];
  /** NULL: "Price on request" (FR-PRC-07). */
  amounts: {
    baseFee: string;
    riskFee: string;
    visitFee: string;
    locationFee: string;
    listPrice: string;
    discountPercent: string;
    discountAmount: string;
    netMonthlyPrice: string;
    annualValue: string;
  } | null;
  contractMonths: number | null;
  /** Prices are shown without VAT, and the PDF says so (Q5). */
  vatIncluded: false;
  note: string | null;
  texts: { intro: RichTextDoc | null; terms: RichTextDoc | null; closing: RichTextDoc | null };
  salesperson: { name: string; phone: string | null; email: string };
}
