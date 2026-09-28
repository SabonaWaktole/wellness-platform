import { findNameClash, lookupLabel, lookupLabels, nextOrder, sortLookupItems } from '../../../../src/lookups/domain/LookupItem';
import { InvalidLookupValueError } from '../../../../src/lookups/domain/errors';

const item = (id: string, nameSq: string, nameEn: string | null, order = 1) => ({ id, nameSq, nameEn, order, active: true });

describe('LookupItem', () => {
  it('FR-LNG-03 requires the Albanian label and makes the English one optional', () => {
    expect(lookupLabels({ nameSq: '  Kafene ', nameEn: ' Café ' })).toEqual({ nameSq: 'Kafene', nameEn: 'Café' });
    expect(lookupLabels({ nameSq: 'Kafene', nameEn: '   ' })).toEqual({ nameSq: 'Kafene', nameEn: null });
    expect(lookupLabels({ nameSq: 'Kafene' })).toEqual({ nameSq: 'Kafene', nameEn: null });
    expect(() => lookupLabels({ nameSq: '  ', nameEn: 'Café' })).toThrow(InvalidLookupValueError);
    expect(() => lookupLabels({ nameSq: 'x'.repeat(101) })).toThrow(InvalidLookupValueError);
  });

  it('FR-LNG-03 shows the English label in English and falls back to Albanian when it is missing', () => {
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'en')).toBe('Café');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: null }, 'en')).toBe('Kafene');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'sq')).toBe('Kafene');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'it')).toBe('Kafene');
  });

  it('finds a name clash case-insensitively across both languages, except for the value being edited', () => {
    const items = [item('a', 'Kafene', 'Café'), item('b', 'Zyrë', null)];

    expect(findNameClash(items, { nameSq: 'KAFENE', nameEn: null })?.id).toBe('a');
    expect(findNameClash(items, { nameSq: 'Bar', nameEn: 'café' })?.id).toBe('a');
    expect(findNameClash(items, { nameSq: 'Kafene', nameEn: 'Café' }, 'a')).toBeUndefined();
    expect(findNameClash(items, { nameSq: 'Hotel', nameEn: null })).toBeUndefined();
  });

  it('sorts by order, then by Albanian name, and appends new values after the last one', () => {
    const items = [item('c', 'Zyrë', null, 2), item('a', 'Kafene', null, 1), item('b', 'Dyqan', null, 2)];

    expect(sortLookupItems(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(nextOrder(items)).toBe(3);
    expect(nextOrder([])).toBe(1);
  });
});
