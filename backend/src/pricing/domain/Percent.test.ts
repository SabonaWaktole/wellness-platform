import { Percent, InvalidPercentError } from './Percent';

describe('Percent (FR-PCF-03)', () => {
  it('FR-PCF-03 accepts the boundary values 0 and 1000', () => {
    expect(Percent.of(0).toString()).toBe('0.00');
    expect(Percent.of(1000).toString()).toBe('1000.00');
  });

  it('FR-PCF-03 accepts up to two decimals', () => {
    expect(Percent.of(12.25).toString()).toBe('12.25');
    expect(Percent.of('10').toString()).toBe('10.00');
  });

  it('FR-PCF-03 rejects a value below 0 or above 1000', () => {
    expect(() => Percent.of(-1)).toThrow(InvalidPercentError);
    expect(() => Percent.of(1000.01)).toThrow(InvalidPercentError);
  });

  it('FR-PCF-03 rejects more than two decimals', () => {
    expect(() => Percent.of(1.234)).toThrow(InvalidPercentError);
  });

  it('FR-PCF-03 rejects NaN and garbage input', () => {
    expect(() => Percent.of(NaN)).toThrow(InvalidPercentError);
    expect(() => Percent.of('not-a-number')).toThrow(InvalidPercentError);
  });

  it('exposes a fraction for multiplying against Money', () => {
    expect(Percent.of(10).fraction.toString()).toBe('0.1');
  });

  it('compares by value with equals', () => {
    expect(Percent.of(10).equals(Percent.of('10.00'))).toBe(true);
    expect(Percent.of(10).equals(Percent.of(20))).toBe(false);
  });

  it('zero() is 0.00', () => {
    expect(Percent.zero().toString()).toBe('0.00');
  });
});
