import {
  firstMappedValue,
  isLegacyMappingConfig,
  resolveMappedValue,
} from '../../../../src/clients/domain/legacy/LegacyMappingConfig';

describe('isLegacyMappingConfig (FR-CMP-08)', () => {
  it('accepts a well-formed config', () => {
    expect(
      isLegacyMappingConfig({
        tenant: 'wellness',
        fields: { businessType: { from: ['Industry'], values: { Hospitality: 'Kafene' } } },
      })
    ).toBe(true);
  });

  it('accepts an empty fields map', () => {
    expect(isLegacyMappingConfig({ tenant: 'wellness', fields: {} })).toBe(true);
  });

  it('rejects a missing tenant', () => {
    expect(isLegacyMappingConfig({ fields: {} })).toBe(false);
  });

  it('rejects a mapping whose `from` is not a string array', () => {
    expect(isLegacyMappingConfig({ tenant: 'wellness', fields: { area: { from: [1] } } })).toBe(false);
  });

  it('rejects a `values` map with a non-string value', () => {
    expect(
      isLegacyMappingConfig({ tenant: 'wellness', fields: { area: { from: ['Area'], values: { X: 5 } } } })
    ).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isLegacyMappingConfig(null)).toBe(false);
    expect(isLegacyMappingConfig('x')).toBe(false);
  });
});

describe('firstMappedValue (FR-CMP-08)', () => {
  it('returns the first present, non-blank value in `from` order', () => {
    const value = firstMappedValue({ from: ['Qyteti', 'City'] }, { City: 'Tirana' });
    expect(value).toBe('Tirana');
  });

  it('skips a blank value and falls through to the next field', () => {
    const value = firstMappedValue({ from: ['Qyteti', 'City'] }, { Qyteti: '  ', City: 'Tirana' });
    expect(value).toBe('Tirana');
  });

  it('stringifies a numeric value', () => {
    expect(firstMappedValue({ from: ['Employees'] }, { Employees: 12 })).toBe('12');
  });

  it('returns undefined when the mapping is undefined', () => {
    expect(firstMappedValue(undefined, { City: 'Tirana' })).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(firstMappedValue({ from: ['City'] }, {})).toBeUndefined();
  });
});

describe('resolveMappedValue (FR-CMP-08)', () => {
  it('substitutes a value found in the explicit map', () => {
    expect(resolveMappedValue({ from: ['Industry'], values: { Hospitality: 'Kafene' } }, 'Hospitality')).toBe(
      'Kafene'
    );
  });

  it('passes the raw value through when it is not in the map', () => {
    expect(resolveMappedValue({ from: ['Industry'], values: { Hospitality: 'Kafene' } }, 'Retail')).toBe('Retail');
  });

  it('passes the raw value through when the mapping has no `values`', () => {
    expect(resolveMappedValue({ from: ['Industry'] }, 'Retail')).toBe('Retail');
  });
});
