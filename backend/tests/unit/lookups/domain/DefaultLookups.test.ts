import { readFileSync } from 'fs';
import * as path from 'path';
import { DEFAULT_BUSINESS_TYPES, DEFAULT_RISK_LEVELS } from '../../../../src/lookups/domain/DefaultLookups';

const prismaDir = path.resolve(__dirname, '../../../../prisma');
const read = (file: string) => readFileSync(path.join(prismaDir, file), 'utf8');

/**
 * New workspaces get their lists from `PrismaLookupSeeder`; existing ones from
 * the migrations. These tests keep the three sources of the placeholder
 * lists in step (FR-SET-10).
 */
describe('Default lookup lists', () => {
  it('FR-SET-10 every default business type points at a default risk level', () => {
    const levels = new Set(DEFAULT_RISK_LEVELS.map((riskLevel) => riskLevel.level));
    for (const type of DEFAULT_BUSINESS_TYPES) {
      expect(levels).toContain(type.riskLevel);
    }
    expect(levels.size).toBe(DEFAULT_RISK_LEVELS.length);
  });

  const migrations = {
    postgres: read('migrations/20260928140000_add_lookup_lists/migration.sql'),
    'mysql (standalone)': read('mysql_migration_add_lookup_lists.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(migrations)) {
    it(`FR-SET-10 the ${name} seed carries the same values, in the same order`, () => {
      DEFAULT_RISK_LEVELS.forEach((riskLevel, index) => {
        const row = new RegExp(
          `${riskLevel.level}\\D[^\\n]*'${riskLevel.nameSq}'[^\\n]*'${riskLevel.nameEn}'[^\\n]*'${riskLevel.description}'[^\\n]*\\b${index + 1}\\b`
        );
        expect(sql).toMatch(row);
      });
      DEFAULT_BUSINESS_TYPES.forEach((type, index) => {
        const row = new RegExp(`'${type.nameSq}'[^\\n]*'${type.nameEn}'[^\\n]*\\b${type.riskLevel}\\b[^\\n]*\\b${index + 1}\\b`);
        expect(sql).toMatch(row);
      });
    });
  }
});
