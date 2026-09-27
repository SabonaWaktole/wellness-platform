import { PlatformSettings, InvalidPlatformSettingsError } from './PlatformSettings';

describe('PlatformSettings', () => {
  describe('defaults', () => {
    it('matches Tenant.create()’s own hardcoded defaults', () => {
      // The whole point of this row: a platform that never saves it produces
      // numerically identical results to today's behaviour, so shipping this
      // feature changes nothing for a platform admin who never opens the page.
      const settings = PlatformSettings.defaults();
      expect(settings).toMatchObject({
        requiresQuotationApproval: true,
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        defaultLanguage: 'en',
      });
      expect(settings.updatedAt).toBeNull();
    });
  });

  describe('withPatch', () => {
    it('changes only the given fields', () => {
      const next = PlatformSettings.defaults().withPatch({ currency: 'EUR' });
      expect(next.currency).toBe('EUR');
      expect(next.locale).toBe('en-US');
      expect(next.timezone).toBe('UTC');
    });

    it('rejects an unsupported locale', () => {
      expect(() => PlatformSettings.defaults().withPatch({ locale: 'xx-XX' })).toThrow(
        InvalidPlatformSettingsError
      );
    });

    it('FR-LNG-04 accepts the Albanian date format as a platform default', () => {
      const next = PlatformSettings.defaults().withPatch({ dateFormat: 'DD.MM.YYYY' });
      expect(next.dateFormat).toBe('DD.MM.YYYY');
    });

    it('rejects an unsupported date format', () => {
      expect(() => PlatformSettings.defaults().withPatch({ dateFormat: 'not-a-format' })).toThrow(
        InvalidPlatformSettingsError
      );
    });

    it('rejects an unsupported language', () => {
      expect(() => PlatformSettings.defaults().withPatch({ defaultLanguage: 'xx' })).toThrow(
        InvalidPlatformSettingsError
      );
    });
  });

  describe('fromPersistence', () => {
    it('carries the stored updatedAt through, unlike defaults()', () => {
      const when = new Date('2026-01-01T00:00:00Z');
      const settings = PlatformSettings.fromPersistence({
        requiresQuotationApproval: false,
        currency: 'GBP',
        locale: 'en-GB',
        timezone: 'Europe/London',
        dateFormat: 'DD/MM/YYYY',
        defaultLanguage: 'en',
        updatedAt: when,
      });
      expect(settings.updatedAt).toBe(when);
      expect(settings.currency).toBe('GBP');
    });
  });
});
