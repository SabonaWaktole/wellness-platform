import { parseOfferSettings } from '../../../src/pricing/domain/OfferSettings';
import { InvalidPricingValueError } from '../../../src/pricing/domain/errors';

const refusal = (values: Record<string, unknown>) => {
  try {
    parseOfferSettings(values);
  } catch (error) {
    return error;
  }
  return null;
};

describe('Offer settings (FR-PCF-08)', () => {
  it('FR-PCF-08 takes validity, contract length and prefix within their ranges', () => {
    expect(parseOfferSettings({ offerValidityDays: 15, contractMonthsDefault: 24, offerNumberPrefix: 'WA' })).toEqual({
      offerValidityDays: 15,
      contractMonthsDefault: 24,
      offerNumberPrefix: 'WA',
    });
    expect(parseOfferSettings({ offerValidityDays: 1, contractMonthsDefault: 60, offerNumberPrefix: 'ABCDEF' })).toMatchObject({
      offerValidityDays: 1,
      contractMonthsDefault: 60,
    });
    expect(parseOfferSettings({ offerValidityDays: 365 }).offerValidityDays).toBe(365);
  });

  it.each([
    ['offerValidityDays', 0],
    ['offerValidityDays', 366],
    ['offerValidityDays', 15.5],
    ['offerValidityDays', '15'],
    ['contractMonthsDefault', 0],
    ['contractMonthsDefault', 61],
    ['offerNumberPrefix', 'of1'],
    ['offerNumberPrefix', 'of'],
    ['offerNumberPrefix', ''],
    ['offerNumberPrefix', 'ABCDEFG'],
    ['offerNumberPrefix', 'O-F'],
    ['email', 'not an email'],
    ['website', 'javascript:alert(1)'],
    ['website', 'not a website'],
    ['companyName', 42],
    ['companyName', 'x'.repeat(192)],
    ['bankDetails', 'x'.repeat(2001)],
  ])('FR-PCF-08 refuses %s = %p with a field error', (field, value) => {
    const error = refusal({ [field]: value });
    expect(error).toBeInstanceOf(InvalidPricingValueError);
    expect(error).toMatchObject({ code: 'INVALID_OFFER_SETTING', field });
  });

  it('FR-PCF-08 keeps only the fields sent, trims them, and clears an empty one', () => {
    expect(
      parseOfferSettings({
        companyName: '  Wellness   Albania ',
        nipt: 'L12345678A',
        email: 'info@wellness.al',
        website: 'wellness.al',
        phone: '',
        bankDetails: ' Raiffeisen Bank\nIBAN AL00 0000 ',
        address: null,
      })
    ).toEqual({
      companyName: 'Wellness Albania',
      nipt: 'L12345678A',
      email: 'info@wellness.al',
      website: 'wellness.al',
      phone: null,
      bankDetails: 'Raiffeisen Bank\nIBAN AL00 0000',
      address: null,
    });
    expect(parseOfferSettings({ website: 'https://wellness.al/en' })).toEqual({ website: 'https://wellness.al/en' });
    expect(parseOfferSettings({})).toEqual({});
  });
});
