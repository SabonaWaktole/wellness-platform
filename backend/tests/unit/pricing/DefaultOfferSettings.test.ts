import { readFileSync } from 'fs';
import * as path from 'path';
import {
  DEFAULT_CONTRACT_MONTHS,
  DEFAULT_OFFER_NUMBER_PREFIX,
  DEFAULT_OFFER_TEXTS,
  DEFAULT_OFFER_VALIDITY_DAYS,
  DEFAULT_SERVICE_PACKAGE,
  DEFAULT_SERVICES,
  OFFER_TEXT_FIELDS,
} from '../../../src/pricing/domain/DefaultOfferSettings';
import { richTextPlainText, sanitizeRichText } from '../../../src/shared/application/richText/sanitizeRichText';
import { parseOfferSettings } from '../../../src/pricing/domain/OfferSettings';

const prismaDir = path.resolve(__dirname, '../../../prisma');
const read = (file: string) => readFileSync(path.join(prismaDir, file), 'utf8');

/**
 * New workspaces get their services, package and offer settings from
 * `PrismaPricingSeeder`; existing ones from the Slice 4 migrations. These
 * tests keep every source in step.
 */
describe('Default services, package and offer settings', () => {
  it('FR-PCF-06 the default package holds placeholder services, each named and described in sq and en', () => {
    expect(DEFAULT_SERVICES.length).toBeGreaterThanOrEqual(3);
    for (const service of [...DEFAULT_SERVICES, DEFAULT_SERVICE_PACKAGE]) {
      for (const value of Object.values(service)) {
        expect(value.trim()).not.toBe('');
        // Plain SQL literals in the migrations.
        expect(value).not.toContain("'");
      }
    }
  });

  it('FR-PCF-08 the offer settings default to 30 days, 12 months and the prefix OF (Q6, Q9), and pass their own rules', () => {
    expect(DEFAULT_OFFER_VALIDITY_DAYS).toBe(30);
    expect(DEFAULT_CONTRACT_MONTHS).toBe(12);
    expect(DEFAULT_OFFER_NUMBER_PREFIX).toBe('OF');
    expect(
      parseOfferSettings({
        offerValidityDays: DEFAULT_OFFER_VALIDITY_DAYS,
        contractMonthsDefault: DEFAULT_CONTRACT_MONTHS,
        offerNumberPrefix: DEFAULT_OFFER_NUMBER_PREFIX,
      })
    ).toEqual({
      offerValidityDays: DEFAULT_OFFER_VALIDITY_DAYS,
      contractMonthsDefault: DEFAULT_CONTRACT_MONTHS,
      offerNumberPrefix: DEFAULT_OFFER_NUMBER_PREFIX,
    });
  });

  it('FR-PCF-08 NFR-SEC-05 every default text is in sq and en and already passes the sanitiser unchanged', () => {
    for (const field of OFFER_TEXT_FIELDS) {
      expect(sanitizeRichText(DEFAULT_OFFER_TEXTS[field])).toEqual(DEFAULT_OFFER_TEXTS[field]);
      expect(JSON.stringify(DEFAULT_OFFER_TEXTS[field])).not.toContain("'");
    }
  });

  it('FR-PCF-08 the terms say VAT is not included, in both languages (Q5)', () => {
    expect(richTextPlainText(DEFAULT_OFFER_TEXTS.termsSq)).toContain('TVSH nuk përfshihet');
    expect(richTextPlainText(DEFAULT_OFFER_TEXTS.termsEn)).toContain('VAT not included');
  });

  for (const schema of ['schema.prisma', 'schema.mysql.prisma']) {
    it(`FR-PCF-08 ${schema} carries the same column defaults`, () => {
      const model = read(schema).match(/model PricingSettings \{[\s\S]*?\n\}/)![0];
      expect(model).toMatch(new RegExp(`offerValidityDays\\s+Int\\s+@default\\(${DEFAULT_OFFER_VALIDITY_DAYS}\\)`));
      expect(model).toMatch(new RegExp(`contractMonthsDefault\\s+Int\\s+@default\\(${DEFAULT_CONTRACT_MONTHS}\\)`));
      expect(model).toMatch(new RegExp(`offerNumberPrefix\\s+String\\s+@default\\("${DEFAULT_OFFER_NUMBER_PREFIX}"\\)`));
    });
  }

  const migrations = {
    postgres: read('migrations/20261001100000_m2_services_offer_settings/migration.sql'),
    'mysql (standalone)': read('mysql_migration_m2_services_offer_settings.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(migrations)) {
    it(`FR-PCF-06 FR-PCF-08 the ${name} seed carries the same services, package, defaults and texts`, () => {
      DEFAULT_SERVICES.forEach((service, index) => {
        expect(sql).toMatch(
          new RegExp(
            `'${service.nameSq}'[^\\n]*'${service.nameEn}'[^\\n]*'${service.descriptionSq}'[^\\n]*'${service.descriptionEn}'[^\\n]*\\b${index + 1}\\b`
          )
        );
      });
      const pkg = DEFAULT_SERVICE_PACKAGE;
      expect(sql).toMatch(
        new RegExp(`'${pkg.nameSq}'[^\\n]*'${pkg.nameEn}'[^\\n]*'${pkg.descriptionSq}'[^\\n]*'${pkg.descriptionEn}'`)
      );
      expect(sql).toMatch(new RegExp(`offerValidityDays\\W+INTEGER NOT NULL DEFAULT ${DEFAULT_OFFER_VALIDITY_DAYS}\\b`));
      expect(sql).toMatch(new RegExp(`contractMonthsDefault\\W+INTEGER NOT NULL DEFAULT ${DEFAULT_CONTRACT_MONTHS}\\b`));
      // MySQL adds the column through a prepared statement, where the quote is doubled.
      expect(sql).toMatch(new RegExp(`offerNumberPrefix\\W+\\w+(?:\\(191\\))? NOT NULL DEFAULT '{1,2}${DEFAULT_OFFER_NUMBER_PREFIX}'`));
      for (const field of OFFER_TEXT_FIELDS) {
        expect(sql).toContain(`'${JSON.stringify(DEFAULT_OFFER_TEXTS[field])}'`);
      }
    });
  }
});
