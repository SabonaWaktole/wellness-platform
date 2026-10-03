import { formatOfferNumber, quotationReference } from './quotationReference';

describe('quotationReference (M2 Slice 9)', () => {
  it('FR-OFR-08 numbers are the prefix, the year and four digits', () => {
    expect(formatOfferNumber('OF', 2026, 1)).toBe('OF-2026-0001');
    expect(formatOfferNumber('WA', 2027, 42)).toBe('WA-2027-0042');
    // Past 9999 the number grows rather than wrapping.
    expect(formatOfferNumber('OF', 2026, 12345)).toBe('OF-2026-12345');
  });

  it('FR-OFR-08 a first version is shown by its number', () => {
    expect(quotationReference({ id: 'a1b2c3d4-0000', number: 'OF-2026-0001', version: 1 })).toBe('OF-2026-0001');
  });

  it('FR-OFR-11 a later version shows its version: OF-2026-0001 v2', () => {
    expect(quotationReference({ id: 'a1b2c3d4-0000', number: 'OF-2026-0001', version: 2 })).toBe('OF-2026-0001 v2');
  });

  it('a row without a number keeps the old id-based reference', () => {
    expect(quotationReference({ id: 'a1b2c3d4-0000-0000', number: null })).toBe('A1B2C3D4');
  });
});
