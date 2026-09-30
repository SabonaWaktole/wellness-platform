import { DomainError } from '@shared/domain/errors/DomainError';
import { Money } from './Money';
import { Percent } from './Percent';
import { PricingConfig, PricingInputs } from './PricingConfig';

export class InvalidEmployeeCountError extends DomainError {
  constructor(value: unknown) {
    super(`Invalid employee count: ${String(value)}. Must be a whole number of at least 1.`);
  }
}

export class UnknownFrequencyError extends DomainError {
  constructor(frequencyId: string) {
    super(`Unknown visit frequency: ${frequencyId}.`);
  }
}

export type PriceOnRequestReason = 'NO_BAND' | 'NO_ZONE' | 'NO_RISK_SURCHARGE';

export interface PricedBreakdown {
  kind: 'PRICED';
  baseFee: Money;
  riskFee: Money;
  visitFee: Money;
  locationFee: Money;
  listPrice: Money;
  /** List price ÷ employees (D8, FR-PRC-10), shown on the pricing screen and the offer. */
  pricePerEmployee: Money;
  /** Base fee ÷ employees, the pricing table's "Proposal Price per Person" column. */
  basePerEmployee: Money;
  /** Monthly list price × the configured contract months (FR-PRC-10). */
  annualValue: Money;
}

export interface PriceOnRequest {
  kind: 'PRICE_ON_REQUEST';
  reason: PriceOnRequestReason;
}

export type PriceCalculationResult = PricedBreakdown | PriceOnRequest;

export interface DiscountResult {
  discountAmount: Money;
  netMonthlyPrice: Money;
}

/**
 * Turns pricing inputs and a pricing configuration into a breakdown, exactly
 * reproducing Wellness Albania's pricing model (SRS §4.1, Figure 1) to the
 * cent (NFR-ACC-01). Pure: no I/O, no database. Slice 3 supplies the real
 * `PricingConfig` from the database; Slices 8 and 10 call this from the
 * pricing screen and the discount flow.
 */
export class PriceCalculator {
  static calculate(inputs: PricingInputs, config: PricingConfig): PriceCalculationResult {
    const { employees, riskLevelId, frequencyId, zoneId } = inputs;

    if (!Number.isInteger(employees) || employees < 1) {
      throw new InvalidEmployeeCountError(employees);
    }

    const band = config.bands.find((b) => employees >= b.min && employees <= b.max);
    if (!band) return { kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' };

    const zonePercent = config.zones[zoneId];
    if (!zonePercent) return { kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' };

    const riskPercent = config.riskSurcharges[riskLevelId];
    if (!riskPercent) return { kind: 'PRICE_ON_REQUEST', reason: 'NO_RISK_SURCHARGE' };

    const frequency = config.frequencies[frequencyId];
    if (!frequency) throw new UnknownFrequencyError(frequencyId);

    // Base fee for the first employee, plus the per-extra-employee fee for
    // every employee above the first (SRS §4.1: "1 employee = €30, 2 = €38").
    const baseFee = band.baseFee.add(band.perEmployeeFee.multiplyBy(employees - 1));

    const riskFee = baseFee.multiplyByPercent(riskPercent);
    const locationFee = baseFee.multiplyByPercent(zonePercent);
    const visitFee = frequency.type === 'PERCENT' ? baseFee.multiplyByPercent(frequency.value) : frequency.amount;

    // The list price is the sum of the already-rounded components, so the
    // breakdown always adds up to the total (FR-PRC-08).
    const listPrice = baseFee.add(riskFee).add(visitFee).add(locationFee);

    return {
      kind: 'PRICED',
      baseFee,
      riskFee,
      visitFee,
      locationFee,
      listPrice,
      pricePerEmployee: listPrice.divideBy(employees),
      basePerEmployee: baseFee.divideBy(employees),
      annualValue: listPrice.multiplyBy(config.contractMonths),
    };
  }

  /**
   * Shared by the pricing screen (Slice 8) and the discount approval flow
   * (Slice 10), so both round the same way.
   */
  static applyDiscount(listPrice: Money, discount: Percent): DiscountResult {
    const discountAmount = listPrice.multiplyByPercent(discount);
    return { discountAmount, netMonthlyPrice: listPrice.subtract(discountAmount) };
  }
}
