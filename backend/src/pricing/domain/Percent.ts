import { DomainError } from '@shared/domain/errors/DomainError';
import { PricingDecimal, type PricingDecimalValue } from './decimal';

export class InvalidPercentError extends DomainError {
  constructor(value: unknown) {
    super(`Invalid percent: ${String(value)}. Must be 0-1000 with up to two decimals.`);
  }
}

/**
 * A percentage from 0 to 1000 with up to two decimals (FR-PCF-03). Money's
 * value object, for every risk, visit-frequency, location and discount
 * surcharge in the pricing model.
 */
export class Percent {
  private constructor(private readonly value: PricingDecimalValue) {}

  static of(input: string | number): Percent {
    let value: PricingDecimalValue;
    try {
      value = new PricingDecimal(input);
    } catch {
      throw new InvalidPercentError(input);
    }

    if (!value.isFinite()) throw new InvalidPercentError(input);
    if (value.lessThan(0) || value.greaterThan(1000)) throw new InvalidPercentError(input);
    if (value.decimalPlaces() > 2) throw new InvalidPercentError(input);

    return new Percent(value);
  }

  static zero(): Percent {
    return Percent.of(0);
  }

  /** The value divided by 100, for multiplying against a `Money` amount. */
  get fraction(): PricingDecimalValue {
    return this.value.dividedBy(100);
  }

  equals(other: Percent): boolean {
    return this.value.equals(other.value);
  }

  /** Strictly above `other`: a discount equal to the cap is within it (FR-DSC-02). */
  exceeds(other: Percent): boolean {
    return this.value.greaterThan(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  toString(): string {
    return this.value.toFixed(2);
  }
}
