import { BandsOverlapError, InvalidPricingValueError, PricingNameTakenError } from '../../../src/pricing/domain/errors';
import { bandRules, EmployeeBand, frequencyRules, PriceZone, VisitFrequency, zoneRules } from '../../../src/pricing/domain/PricingLists';
import { parseFee, parsePercent } from '../../../src/pricing/domain/PricingValues';

const band = (id: string, minEmployees: number, maxEmployees: number, active = true): EmployeeBand => ({
  id,
  minEmployees,
  maxEmployees,
  baseFee: '30.00',
  perEmployeeFee: '8.00',
  active,
  order: 0,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe('Pricing values (FR-PCF-03)', () => {
  it.each([
    ['30', '30.00'],
    ['8.5', '8.50'],
    [' 12.25 ', '12.25'],
    [0, '0.00'],
    [15, '15.00'],
  ])('FR-PCF-03 accepts the fee %p and stores it as %p', (input, stored) => {
    expect(parseFee(input, 'baseFee')).toBe(stored);
  });

  it.each([['-1'], [-1], ['abc'], [''], ['1.234'], ['1e3'], ['0x10'], [null], [undefined], [NaN], [0.1 + 0.2]])(
    'FR-PCF-03 refuses the fee %p',
    (input) => {
      expect(codeOf(() => parseFee(input, 'baseFee'))).toBe('INVALID_FEE');
    }
  );

  it.each([['0', '0.00'], ['12', '12.00'], ['1000', '1000.00'], [28, '28.00'], ['99.99', '99.99']])(
    'FR-PCF-03 accepts the percentage %p',
    (input, stored) => {
      expect(parsePercent(input, 'surchargePercent')).toBe(stored);
    }
  );

  it.each([['-0.01'], ['1000.01'], ['12.345'], ['ten'], [''], [null]])('FR-PCF-03 refuses the percentage %p', (input) => {
    expect(codeOf(() => parsePercent(input, 'surchargePercent'))).toBe('INVALID_PERCENT');
  });

  it('FR-PCF-07 a percentage can have a tighter ceiling, like the discount cap', () => {
    expect(parsePercent('100', 'discountCapPercent', 100)).toBe('100.00');
    expect(codeOf(() => parsePercent('100.01', 'discountCapPercent', 100))).toBe('INVALID_PERCENT');
  });
});

describe('Employee bands (FR-PCF-01)', () => {
  it('FR-PCF-01 builds a band from the request, keeping omitted fields on an edit', () => {
    const built = bandRules.build({ minEmployees: 11, maxEmployees: 50, baseFee: '100', perEmployeeFee: 6.5 }, null);
    expect(built).toEqual({ minEmployees: 11, maxEmployees: 50, baseFee: '100.00', perEmployeeFee: '6.50' });

    expect(bandRules.build({ maxEmployees: 12 }, band('b', 1, 10))).toEqual({
      minEmployees: 1,
      maxEmployees: 12,
      baseFee: '30.00',
      perEmployeeFee: '8.00',
    });
  });

  it.each([
    [{ minEmployees: 0, maxEmployees: 10 }, 'INVALID_PRICING_VALUE'],
    [{ minEmployees: 1.5, maxEmployees: 10 }, 'INVALID_PRICING_VALUE'],
    [{ minEmployees: 10, maxEmployees: 5 }, 'INVALID_BAND_RANGE'],
    [{ minEmployees: 1, maxEmployees: 10, baseFee: '-5' }, 'INVALID_FEE'],
    [{ minEmployees: 1, maxEmployees: 10, perEmployeeFee: '8.005' }, 'INVALID_FEE'],
  ])('FR-PCF-01 refuses the band %p', (values, code) => {
    expect(codeOf(() => bandRules.build({ baseFee: '30', perEmployeeFee: '8', ...values }, null))).toBe(code);
  });

  it('FR-PCF-01 refuses a band overlapping another active band, with a clear message', () => {
    const existing = [band('a', 1, 10)];
    expect(() => bandRules.validate(band('new', 10, 20), existing)).toThrow(BandsOverlapError);
    expect(() => bandRules.validate(band('new', 5, 6), existing)).toThrow('overlaps the band 1–10 employees');
    expect(() => bandRules.validate(band('new', 11, 50), existing)).not.toThrow();
  });

  it('FR-PCF-01 an inactive band overlaps nothing, and a band may keep its own range on an edit', () => {
    expect(() => bandRules.validate(band('new', 1, 10), [band('old', 1, 10, false)])).not.toThrow();
    expect(() => bandRules.validate(band('new', 1, 10, false), [band('a', 1, 10)])).not.toThrow();
    expect(() => bandRules.validate(band('a', 1, 12), [band('a', 1, 10)])).not.toThrow();
  });
});

describe('Visit frequencies (FR-PCF-04)', () => {
  const monthly: VisitFrequency = {
    id: 'm',
    nameSq: 'Çdo muaj',
    nameEn: 'Monthly',
    visitsPerYear: 12,
    pricingType: 'PERCENT',
    frequencyValue: '100.00',
    order: 1,
    active: true,
  };

  it('FR-PCF-04 a percentage frequency takes a percentage, a fixed one takes an amount', () => {
    expect(
      frequencyRules.build({ nameSq: '3 herë në vit', nameEn: '3 per year', visitsPerYear: 3, pricingType: 'PERCENT', frequencyValue: '28' }, null)
    ).toEqual({ nameSq: '3 herë në vit', nameEn: '3 per year', visitsPerYear: 3, pricingType: 'PERCENT', frequencyValue: '28.00' });

    expect(frequencyRules.build({ nameSq: 'Urgjent', pricingType: 'FIXED', frequencyValue: '1500.5' }, null)).toMatchObject({
      pricingType: 'FIXED',
      frequencyValue: '1500.50',
      visitsPerYear: null,
      nameEn: null,
    });
  });

  it.each([
    [{ pricingType: 'PERCENT', frequencyValue: '1000.01' }, 'INVALID_PERCENT'],
    [{ pricingType: 'FIXED', frequencyValue: '-1' }, 'INVALID_FEE'],
    [{ pricingType: 'WEEKLY', frequencyValue: '1' }, 'INVALID_PRICING_VALUE'],
    [{ pricingType: 'PERCENT', frequencyValue: '1', visitsPerYear: 0 }, 'INVALID_PRICING_VALUE'],
    [{ pricingType: 'PERCENT', frequencyValue: '1', nameSq: '   ' }, 'INVALID_PRICING_VALUE'],
  ])('FR-PCF-03 FR-PCF-04 refuses the frequency %p', (values, code) => {
    expect(codeOf(() => frequencyRules.build({ nameSq: 'X', ...values }, null))).toBe(code);
  });

  it('FR-PCF-04 two frequencies may not share a name', () => {
    expect(() => frequencyRules.validate({ ...monthly, id: 'other', nameSq: 'çdo MUAJ' }, [monthly])).toThrow(PricingNameTakenError);
    expect(() => frequencyRules.validate(monthly, [monthly])).not.toThrow();
  });
});

describe('Price zones (FR-PCF-05)', () => {
  const centre: PriceZone = {
    id: 'z',
    nameSq: 'Tirana qendër',
    nameEn: 'Tirana centre',
    surchargePercent: '0.00',
    cityIds: ['c1'],
    order: 1,
    active: true,
  };

  it('FR-PCF-05 an edit changes the label and surcharge and keeps the zone\'s cities', () => {
    expect(zoneRules.build({ surchargePercent: '5' }, centre)).toEqual({
      nameSq: 'Tirana qendër',
      nameEn: 'Tirana centre',
      surchargePercent: '5.00',
      cityIds: ['c1'],
    });
  });

  it('FR-PCF-03 FR-PCF-05 refuses a surcharge above 1000% and a duplicate name', () => {
    expect(() => zoneRules.build({ nameSq: 'Z', surchargePercent: '1001' }, null)).toThrow(InvalidPricingValueError);
    expect(() => zoneRules.validate({ ...centre, id: 'other', nameEn: null, nameSq: 'Tirana Centre' }, [centre])).toThrow(
      PricingNameTakenError
    );
  });
});
