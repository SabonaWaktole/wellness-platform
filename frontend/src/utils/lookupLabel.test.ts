import { describe, expect, it } from 'vitest';
import { lookupLabel } from './lookupLabel';

describe('lookupLabel', () => {
  it('FR-LNG-03 shows the Albanian name in Albanian', () => {
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'sq')).toBe('Kafene');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'sq-AL')).toBe('Kafene');
  });

  it('FR-LNG-03 shows the English name in other languages', () => {
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'en')).toBe('Café');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: 'Café' }, 'it')).toBe('Café');
  });

  it('FR-LNG-03 falls back to Albanian when the English name is missing', () => {
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: null }, 'en')).toBe('Kafene');
    expect(lookupLabel({ nameSq: 'Kafene', nameEn: '' }, 'en')).toBe('Kafene');
    expect(lookupLabel({ nameSq: 'Kafene' }, 'el')).toBe('Kafene');
  });
});
