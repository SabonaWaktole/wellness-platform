import { Money } from '../../../src/pricing/domain/Money';
import { Percent } from '../../../src/pricing/domain/Percent';
import { PriceCalculator, InvalidEmployeeCountError, UnknownFrequencyError } from '../../../src/pricing/domain/PriceCalculator';
import {
  figure1Rows,
  figure1Config,
  RISK_LOW,
  RISK_MEDIUM,
  RISK_HIGH,
  FREQ_ONE_YEAR,
  FREQ_TWO_YEAR,
  FREQ_FOUR_YEAR,
  FREQ_SIX_YEAR,
  FREQ_MONTHLY,
  FREQ_AD_HOC,
  ZONE_CENTER,
  ZONE_SUBURBS,
  ZONE_KAMZA_VORE,
  ZONE_ELBASAN_DURRES,
} from './pricingModelFigure1';

const RISK_IDS = [
  [RISK_LOW, 'low'],
  [RISK_MEDIUM, 'medium'],
  [RISK_HIGH, 'high'],
] as const;

const FREQUENCY_IDS = [
  [FREQ_ONE_YEAR, 'oneYear'],
  [FREQ_TWO_YEAR, 'twoYear'],
  [FREQ_FOUR_YEAR, 'fourYear'],
  [FREQ_SIX_YEAR, 'sixYear'],
  [FREQ_MONTHLY, 'monthly'],
  [FREQ_AD_HOC, 'adHoc'],
] as const;

const ZONE_IDS = [
  [ZONE_CENTER, 'center'],
  [ZONE_SUBURBS, 'suburbs'],
  [ZONE_KAMZA_VORE, 'kamzaVore'],
  [ZONE_ELBASAN_DURRES, 'elbasanDurres'],
] as const;

describe('PriceCalculator (NFR-ACC-01)', () => {
  describe('NFR-ACC-01 base fee and per-employee price, every Figure 1 row', () => {
    const cases = figure1Rows.map((row) => ({
      employees: row.employees,
      expectedBase: row.base,
      expectedBasePerEmployee: row.basePerEmployee,
    }));

    it.each(cases)('employees=$employees', ({ employees, expectedBase, expectedBasePerEmployee }) => {
      const result = PriceCalculator.calculate(
        { employees, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.baseFee.toString()).toBe(expectedBase);
      expect(result.basePerEmployee.toString()).toBe(expectedBasePerEmployee);
    });
  });

  describe('NFR-ACC-01 risk fee, every Figure 1 cell', () => {
    const cases = figure1Rows.flatMap((row) =>
      RISK_IDS.map(([riskLevelId, key]) => ({
        employees: row.employees,
        riskLevelId,
        expected: row.risk[key],
      }))
    );

    it.each(cases)('employees=$employees risk=$riskLevelId', ({ employees, riskLevelId, expected }) => {
      const result = PriceCalculator.calculate(
        { employees, riskLevelId, frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.riskFee.toString()).toBe(expected);
    });
  });

  describe('NFR-ACC-01 visit fee, every Figure 1 cell (Q2: ad hoc is a fixed €15.00)', () => {
    const cases = figure1Rows.flatMap((row) =>
      FREQUENCY_IDS.map(([frequencyId, key]) => ({
        employees: row.employees,
        frequencyId,
        expected: row.frequency[key],
      }))
    );

    it.each(cases)('employees=$employees frequency=$frequencyId', ({ employees, frequencyId, expected }) => {
      const result = PriceCalculator.calculate(
        { employees, riskLevelId: RISK_LOW, frequencyId, zoneId: ZONE_CENTER },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.visitFee.toString()).toBe(expected);
    });
  });

  describe('NFR-ACC-01 location fee, every Figure 1 cell', () => {
    const cases = figure1Rows.flatMap((row) =>
      ZONE_IDS.map(([zoneId, key]) => ({
        employees: row.employees,
        zoneId,
        expected: row.zone[key],
      }))
    );

    it.each(cases)('employees=$employees zone=$zoneId', ({ employees, zoneId, expected }) => {
      const result = PriceCalculator.calculate(
        { employees, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.locationFee.toString()).toBe(expected);
    });
  });

  describe('NFR-ACC-01, FR-PRC-08 every combination of employees × risk × frequency × zone (720)', () => {
    const cases = figure1Rows.flatMap((row) =>
      RISK_IDS.flatMap(([riskLevelId, riskKey]) =>
        FREQUENCY_IDS.flatMap(([frequencyId, freqKey]) =>
          ZONE_IDS.map(([zoneId, zoneKey]) => ({
            employees: row.employees,
            riskLevelId,
            frequencyId,
            zoneId,
            expectedListPrice: Money.of(row.base)
              .add(Money.of(row.risk[riskKey]))
              .add(Money.of(row.frequency[freqKey]))
              .add(Money.of(row.zone[zoneKey]))
              .toString(),
          }))
        )
      )
    );

    expect(cases).toHaveLength(720);

    it.each(cases)(
      'employees=$employees risk=$riskLevelId frequency=$frequencyId zone=$zoneId',
      ({ employees, riskLevelId, frequencyId, zoneId, expectedListPrice }) => {
        const result = PriceCalculator.calculate({ employees, riskLevelId, frequencyId, zoneId }, figure1Config);

        if (result.kind !== 'PRICED') throw new Error('expected a price');
        expect(result.listPrice.toString()).toBe(expectedListPrice);
        // FR-PRC-08: the breakdown always adds up to the total.
        expect(result.baseFee.add(result.riskFee).add(result.visitFee).add(result.locationFee).toString()).toBe(
          result.listPrice.toString()
        );
      }
    );
  });

  describe('NFR-ACC-01 worked examples (SRS §4.1)', () => {
    it('Example A: 2 employees, Medium risk, 2/year, Tirana centre → list 49.40, net 44.46 at 10%', () => {
      const result = PriceCalculator.calculate(
        { employees: 2, riskLevelId: RISK_MEDIUM, frequencyId: FREQ_TWO_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.baseFee.toString()).toBe('38.00');
      expect(result.riskFee.toString()).toBe('3.80');
      expect(result.visitFee.toString()).toBe('7.60');
      expect(result.locationFee.toString()).toBe('0.00');
      expect(result.listPrice.toString()).toBe('49.40');

      const discount = PriceCalculator.applyDiscount(result.listPrice, Percent.of(10));
      expect(discount.discountAmount.toString()).toBe('4.94');
      expect(discount.netMonthlyPrice.toString()).toBe('44.46');
    });

    it('Example B: 5 employees, High risk, Monthly, Kamëz → list 155.00, net 139.50 at 10%', () => {
      const result = PriceCalculator.calculate(
        { employees: 5, riskLevelId: RISK_HIGH, frequencyId: FREQ_MONTHLY, zoneId: ZONE_KAMZA_VORE },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.baseFee.toString()).toBe('62.00');
      expect(result.riskFee.toString()).toBe('12.40');
      expect(result.visitFee.toString()).toBe('62.00');
      expect(result.locationFee.toString()).toBe('18.60');
      expect(result.listPrice.toString()).toBe('155.00');

      const discount = PriceCalculator.applyDiscount(result.listPrice, Percent.of(10));
      expect(discount.discountAmount.toString()).toBe('15.50');
      expect(discount.netMonthlyPrice.toString()).toBe('139.50');
    });
  });

  describe('FR-PRC-10 price per employee and annual value', () => {
    it('Example A shows 24.70 per employee and 592.80 per year', () => {
      const result = PriceCalculator.calculate(
        { employees: 2, riskLevelId: RISK_MEDIUM, frequencyId: FREQ_TWO_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      if (result.kind !== 'PRICED') throw new Error('expected a price');
      expect(result.pricePerEmployee.toString()).toBe('24.70');
      expect(result.annualValue.toString()).toBe('592.80');
    });
  });

  describe('FR-PRC-07 "Price on request" when no rule covers the inputs', () => {
    it('40 employees, outside the only configured band, gives NO_BAND with no amounts', () => {
      const result = PriceCalculator.calculate(
        { employees: 40, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      expect(result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_BAND' });
    });

    it('an unconfigured zone gives NO_ZONE with no amounts', () => {
      const result = PriceCalculator.calculate(
        { employees: 2, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId: 'unknown-zone' },
        figure1Config
      );

      expect(result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_ZONE' });
    });

    it('a risk level with no configured surcharge gives NO_RISK_SURCHARGE with no amounts', () => {
      const result = PriceCalculator.calculate(
        { employees: 2, riskLevelId: 'unknown-risk', frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
        figure1Config
      );

      expect(result).toEqual({ kind: 'PRICE_ON_REQUEST', reason: 'NO_RISK_SURCHARGE' });
    });
  });

  describe('invalid inputs', () => {
    it('rejects a non-integer or non-positive employee count', () => {
      expect(() =>
        PriceCalculator.calculate(
          { employees: 0, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
          figure1Config
        )
      ).toThrow(InvalidEmployeeCountError);

      expect(() =>
        PriceCalculator.calculate(
          { employees: 2.5, riskLevelId: RISK_LOW, frequencyId: FREQ_ONE_YEAR, zoneId: ZONE_CENTER },
          figure1Config
        )
      ).toThrow(InvalidEmployeeCountError);
    });

    it('throws on an unknown frequency id (a caller bug, not Price on request)', () => {
      expect(() =>
        PriceCalculator.calculate(
          { employees: 2, riskLevelId: RISK_LOW, frequencyId: 'unknown-frequency', zoneId: ZONE_CENTER },
          figure1Config
        )
      ).toThrow(UnknownFrequencyError);
    });
  });
});
