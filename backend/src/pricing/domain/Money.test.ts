import { Money, InvalidMoneyError, DivisionByZeroError } from './Money';
import { Percent } from './Percent';

describe('Money (NFR-ACC-02)', () => {
  it('NFR-ACC-02 rounds half up to the cent on construction', () => {
    expect(Money.of(0.005).toString()).toBe('0.01');
    expect(Money.of(0.0049).toString()).toBe('0.00');
    expect(Money.of('1.005').toString()).toBe('1.01');
  });

  it('NFR-ACC-02 adds without float drift', () => {
    const sum = Money.of('0.1').add(Money.of('0.2'));
    expect(sum.toString()).toBe('0.30');
    // Plain JS float arithmetic gives 0.30000000000000004 here.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('NFR-ACC-02 subtracts to the cent', () => {
    expect(Money.of('49.40').subtract(Money.of('4.94')).toString()).toBe('44.46');
  });

  it('NFR-ACC-02 multiplies by a percent, rounded half up to the cent', () => {
    expect(Money.of('38.00').multiplyByPercent(Percent.of(10)).toString()).toBe('3.80');
    // 155 * 0.005 = 0.775 -> rounds to 0.78 under half-up.
    expect(Money.of('155.00').multiplyByPercent(Percent.of(0.5)).toString()).toBe('0.78');
  });

  it('NFR-ACC-02 multiplies by a whole-number factor', () => {
    expect(Money.of('49.40').multiplyBy(12).toString()).toBe('592.80');
  });

  it('NFR-ACC-02 divides, rounded half up to the cent', () => {
    expect(Money.of('46.00').divideBy(3).toString()).toBe('15.33');
    expect(Money.of('70.00').divideBy(6).toString()).toBe('11.67');
    expect(Money.of('49.40').divideBy(2).toString()).toBe('24.70');
  });

  it('NFR-ACC-02 rejects division by zero or a non-integer divisor', () => {
    expect(() => Money.of('10.00').divideBy(0)).toThrow(DivisionByZeroError);
    expect(() => Money.of('10.00').divideBy(-1)).toThrow(DivisionByZeroError);
    expect(() => Money.of('10.00').divideBy(1.5)).toThrow(DivisionByZeroError);
  });

  it('NFR-ACC-02 rejects a non-integer multiplier', () => {
    expect(() => Money.of('10.00').multiplyBy(1.5)).toThrow(InvalidMoneyError);
  });

  it('NFR-ACC-02 rejects NaN, Infinity and garbage input', () => {
    expect(() => Money.of(NaN)).toThrow(InvalidMoneyError);
    expect(() => Money.of(Infinity)).toThrow(InvalidMoneyError);
    expect(() => Money.of('not-a-number')).toThrow(InvalidMoneyError);
  });

  it('NFR-ACC-02 is immutable: every operation returns a new instance', () => {
    const a = Money.of('10.00');
    const b = a.add(Money.of('5.00'));
    expect(a.toString()).toBe('10.00');
    expect(b.toString()).toBe('15.00');
  });

  it('NFR-ACC-02 compares by value with equals', () => {
    expect(Money.of('10.00').equals(Money.of(10))).toBe(true);
    expect(Money.of('10.00').equals(Money.of('10.01'))).toBe(false);
  });

  it('NFR-ACC-02 zero() is 0.00', () => {
    expect(Money.zero().toString()).toBe('0.00');
    expect(Money.zero().isZero()).toBe(true);
  });
});
