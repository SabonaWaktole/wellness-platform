/** A list value as the pricing screen and the offer show it. */
export interface PricingLabel {
  id: string;
  nameSq: string;
  nameEn: string | null;
}

/**
 * What the pricing screen prices: a company, reached directly or through one
 * of its deals (FR-PRC-01). Its employees, business type and city pre-fill
 * the inputs (FR-PRC-02). The location is the company's city, never typed.
 */
export interface PricingSubject {
  clientId: string;
  companyName: string;
  /** The company's salesperson, for the `offers.edit` scope when no deal is named. */
  companyAssigneeId: string | null;
  /** The deal priced from, or null when the screen was opened on the company. */
  deal: { id: string; ownerUserId: string; open: boolean } | null;
  employeeCount: number | null;
  businessTypeId: string | null;
  city: PricingLabel | null;
  area: PricingLabel | null;
}

/** Reads the subject of a calculation. Every method takes `tenantId` first; deleted companies and deals are not found. */
export interface IPricingSubjectReader {
  forCompany(tenantId: string, clientId: string): Promise<PricingSubject | null>;
  forDeal(tenantId: string, dealId: string): Promise<PricingSubject | null>;
}
