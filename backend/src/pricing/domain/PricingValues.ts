import { InvalidPricingValueError } from './errors';
import { Money } from './Money';
import { Percent } from './Percent';

/**
 * A plain decimal as the Administrator types it: digits, optionally a point
 * and one or two decimals. No sign, no exponent, no hex: `Money.of` and
 * `Percent.of` would accept "1e3" or "0x10", which no one means as a price.
 */
const DECIMAL = /^\d+(\.\d{1,2})?$/;

function asDecimalText(input: unknown): string | null {
  if (typeof input === 'number') return Number.isFinite(input) ? String(input) : null;
  if (typeof input === 'string') return input.trim();
  return null;
}

/** A fee: ≥ 0 with up to two decimals (FR-PCF-03). Returns it as stored, e.g. "8.00". */
export function parseFee(input: unknown, field: string): string {
  const text = asDecimalText(input);
  if (text === null || !DECIMAL.test(text)) {
    throw new InvalidPricingValueError('INVALID_FEE', field, 'Enter an amount of 0 or more, with up to two decimals.');
  }
  return Money.of(text).toString();
}

/**
 * A percentage: 0 to `max` (1000 unless the value has a tighter meaning, like
 * the discount cap) with up to two decimals (FR-PCF-03). Returns it as stored,
 * e.g. "10.00".
 */
export function parsePercent(input: unknown, field: string, max = 1000): string {
  const text = asDecimalText(input);
  if (text === null || !DECIMAL.test(text) || Number(text) > max) {
    throw new InvalidPricingValueError(
      'INVALID_PERCENT',
      field,
      `Enter a percentage from 0 to ${max}, with up to two decimals.`
    );
  }
  return Percent.of(text).toString();
}

/** A whole number from `min` to `max`, e.g. employees or visits per year. */
export function parseWholeNumber(input: unknown, field: string, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < min || input > max) {
    throw new InvalidPricingValueError('INVALID_PRICING_VALUE', field, `Enter a whole number from ${min} to ${max}.`);
  }
  return input;
}
