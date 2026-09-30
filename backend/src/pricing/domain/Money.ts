import { DomainError } from '@shared/domain/errors/DomainError';
import { PricingDecimal, type PricingDecimalValue } from './decimal';
import { Percent } from './Percent';

export class InvalidMoneyError extends DomainError {
  constructor(value: unknown) {
    super(`Invalid money amount: ${String(value)}.`);
  }
}

export class DivisionByZeroError extends DomainError {
  constructor() {
    super('Cannot divide a money amount by zero.');
  }
}

/**
 * An immutable EUR amount, always held at two decimals, half-up rounded
 * (NFR-ACC-02). The domain never touches `Prisma.Decimal` or `number`
 * directly for money: every pricing calculation, and every amount a later
 * slice stores, goes through this type (and `Percent`) so a float can never
 * creep back in. The API layer sends the string form (`"49.40"`); the
 * frontend only formats it and never recomputes it.
 */
export class Money {
  private constructor(private readonly value: PricingDecimalValue) {}

  static of(input: string | number | PricingDecimalValue): Money {
    let value: PricingDecimalValue;
    try {
      value = new PricingDecimal(input);
    } catch {
      throw new InvalidMoneyError(input);
    }

    if (!value.isFinite()) throw new InvalidMoneyError(input);

    return new Money(value.toDecimalPlaces(2, PricingDecimal.ROUND_HALF_UP));
  }

  static zero(): Money {
    return Money.of(0);
  }

  add(other: Money): Money {
    return Money.of(this.value.plus(other.value));
  }

  subtract(other: Money): Money {
    return Money.of(this.value.minus(other.value));
  }

  multiplyByPercent(percent: Percent): Money {
    return Money.of(this.value.times(percent.fraction));
  }

  multiplyBy(factor: number): Money {
    if (!Number.isInteger(factor)) throw new InvalidMoneyError(factor);
    return Money.of(this.value.times(factor));
  }

  divideBy(divisor: number): Money {
    if (!Number.isInteger(divisor) || divisor <= 0) throw new DivisionByZeroError();
    return Money.of(this.value.dividedBy(divisor));
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  equals(other: Money): boolean {
    return this.value.equals(other.value);
  }

  toString(): string {
    return this.value.toFixed(2);
  }
}
