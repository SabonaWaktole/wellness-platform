import { readFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_SALES_SCRIPT, DEFAULT_SCRIPT_SECTIONS } from '../../../src/salesScript/domain/DefaultSalesScript';
import { scriptSections } from '../../../src/salesScript/domain/scriptSections';
import { sanitizeRichText } from '../../../src/shared/application/richText/sanitizeRichText';

const prismaDir = path.resolve(__dirname, '../../../prisma');
const read = (file: string) => readFileSync(path.join(prismaDir, file), 'utf8');

/**
 * New workspaces get the placeholder script from `PrismaSalesScriptSeeder`;
 * existing ones from the Slice 5 migrations. These tests keep every source in
 * step.
 */
describe('Default sales script', () => {
  it('FR-SCR-03 the placeholder script has the SRS sections, as section headings, in sq and en', () => {
    expect(scriptSections(DEFAULT_SALES_SCRIPT.contentSq).map((section) => section.title)).toEqual(
      DEFAULT_SCRIPT_SECTIONS.map((section) => section.sq)
    );
    expect(scriptSections(DEFAULT_SALES_SCRIPT.contentEn).map((section) => section.title)).toEqual([
      'Opening',
      'Needs discovery',
      'Pricing questions',
      'Objections',
      'Closing',
    ]);
  });

  it('NFR-SEC-05 both languages already pass the sanitiser unchanged, and hold no apostrophe for the SQL literals', () => {
    for (const content of [DEFAULT_SALES_SCRIPT.contentSq, DEFAULT_SALES_SCRIPT.contentEn]) {
      expect(sanitizeRichText(content)).toEqual(content);
      expect(JSON.stringify(content)).not.toContain("'");
    }
  });

  const migrations = {
    postgres: read('migrations/20261001120000_m2_sales_script/migration.sql'),
    'mysql (standalone)': read('mysql_migration_m2_sales_script.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(migrations)) {
    it(`FR-SCR-03 the ${name} seed publishes the same placeholder script as version 1`, () => {
      expect(sql).toContain(`'${JSON.stringify(DEFAULT_SALES_SCRIPT.contentSq)}'`);
      expect(sql).toContain(`'${JSON.stringify(DEFAULT_SALES_SCRIPT.contentEn)}'`);
      expect(sql).toMatch(/'PUBLISHED',\s*'PUBLISHED'/);
    });
  }
});
