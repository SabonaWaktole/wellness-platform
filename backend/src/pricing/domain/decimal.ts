import Decimal from 'decimal.js';

/**
 * A pricing-local clone of `Decimal`, configured once here rather than by
 * mutating the library's global `Decimal.set(...)`. Mutating the global
 * would silently change rounding for any other module that imports
 * `decimal.js` directly, which is exactly the float-style bug this module
 * exists to avoid (NFR-ACC-02).
 */
export const PricingDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

/** The instance type of `PricingDecimal`, for use in field and parameter types. */
export type PricingDecimalValue = InstanceType<typeof PricingDecimal>;
