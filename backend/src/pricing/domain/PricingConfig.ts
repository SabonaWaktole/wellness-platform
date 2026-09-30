import { Money } from './Money';
import { Percent } from './Percent';

/**
 * An employee band: the base fee for the first employee in the band, plus a
 * fee per extra employee above it. Bounds are inclusive; a company with no
 * covering band cannot be priced (FR-PRC-07).
 */
export interface PricingBand {
  min: number;
  max: number;
  baseFee: Money;
  perEmployeeFee: Money;
}

/**
 * How a visit frequency contributes to the price: a percentage of the base
 * fee, or a fixed monthly amount (ad hoc, Q2).
 */
export type FrequencyPricing = { type: 'PERCENT'; value: Percent } | { type: 'FIXED'; amount: Money };

/**
 * The Administrator-managed pricing rules (Slice 3 will read this from the
 * database; here it is a plain in-memory shape the calculator consumes).
 */
export interface PricingConfig {
  bands: PricingBand[];
  riskSurcharges: Record<string, Percent>;
  frequencies: Record<string, FrequencyPricing>;
  zones: Record<string, Percent>;
  discountCap: Percent;
  /** Contract months used for the annual value, default 12 (FR-PCF-08). */
  contractMonths: number;
}

/** What the salesperson selects; risk level follows from the company's business type. */
export interface PricingInputs {
  employees: number;
  riskLevelId: string;
  frequencyId: string;
  zoneId: string;
}
