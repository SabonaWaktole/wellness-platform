import { readFileSync } from 'fs';
import * as path from 'path';
import {
  DEFAULT_AREAS,
  DEFAULT_BUSINESS_TYPES,
  DEFAULT_FOLLOW_UP_INTERVALS,
  DEFAULT_LOST_REASONS,
  DEFAULT_RISK_LEVELS,
} from '../../../../src/lookups/domain/DefaultLookups';

const prismaDir = path.resolve(__dirname, '../../../../prisma');
const read = (file: string) => readFileSync(path.join(prismaDir, file), 'utf8');

/**
 * New workspaces get their lists from `PrismaLookupSeeder`; existing ones from
 * the migrations. These tests keep every source of the placeholder lists in
 * step (FR-SET-10).
 */
describe('Default lookup lists', () => {
  it('FR-SET-10 every default business type points at a default risk level', () => {
    const levels = new Set(DEFAULT_RISK_LEVELS.map((riskLevel) => riskLevel.level));
    for (const type of DEFAULT_BUSINESS_TYPES) {
      expect(levels).toContain(type.riskLevel);
    }
    expect(levels.size).toBe(DEFAULT_RISK_LEVELS.length);
  });

  it('FR-SET-10 every default area has at least one city, and area names are unique', () => {
    const names = new Set(DEFAULT_AREAS.map((area) => area.nameSq));
    expect(names.size).toBe(DEFAULT_AREAS.length);
    for (const area of DEFAULT_AREAS) {
      expect(area.cities.length).toBeGreaterThan(0);
    }
  });

  const riskAndBusinessMigrations = {
    postgres: read('migrations/20260928140000_add_lookup_lists/migration.sql'),
    'mysql (standalone)': read('mysql_migration_add_lookup_lists.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(riskAndBusinessMigrations)) {
    it(`FR-SET-10 the ${name} seed carries the same risk levels and business types, in the same order`, () => {
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

  const areaCityMigrations = {
    postgres: read('migrations/20260928140105_add_areas_cities/migration.sql'),
    'mysql (standalone)': read('mysql_migration_add_areas_cities.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(areaCityMigrations)) {
    it(`FR-SET-10 the ${name} seed carries the same areas and cities, in the same order`, () => {
      DEFAULT_AREAS.forEach((area, index) => {
        const areaRow = new RegExp(`'${area.nameSq}'[^\\n]*'${area.nameEn}'[^\\n]*\\b${index + 1}\\b`);
        expect(sql).toMatch(areaRow);

        area.cities.forEach((city, cityIndex) => {
          const cityRow = new RegExp(`'${area.nameSq}'[^\\n]*'${city.nameSq}'[^\\n]*'${city.nameEn}'[^\\n]*\\b${cityIndex + 1}\\b`);
          expect(sql).toMatch(cityRow);
        });
      });
    });
  }

  it('FR-SET-05 every default follow-up interval has a unique number of days', () => {
    const days = new Set(DEFAULT_FOLLOW_UP_INTERVALS.map((interval) => interval.days));
    expect(days.size).toBe(DEFAULT_FOLLOW_UP_INTERVALS.length);
  });

  it('FR-SET-06 default lost-deal reason names are unique', () => {
    const names = new Set(DEFAULT_LOST_REASONS.map((reason) => reason.nameSq));
    expect(names.size).toBe(DEFAULT_LOST_REASONS.length);
  });

  const salesListMigrations = {
    postgres: read('migrations/20260928173234_add_sales_lists/migration.sql'),
    'mysql (standalone)': read('mysql_migration_add_sales_lists.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(salesListMigrations)) {
    it(`FR-SET-10 the ${name} seed carries the same follow-up intervals and lost-deal reasons, in the same order`, () => {
      DEFAULT_FOLLOW_UP_INTERVALS.forEach((interval, index) => {
        const row = new RegExp(`${interval.days}\\D[^\\n]*'${interval.nameSq}'[^\\n]*'${interval.nameEn}'[^\\n]*\\b${index + 1}\\b`);
        expect(sql).toMatch(row);
      });
      DEFAULT_LOST_REASONS.forEach((reason, index) => {
        const row = new RegExp(`'${reason.nameSq}'[^\\n]*'${reason.nameEn}'[^\\n]*\\b${index + 1}\\b`);
        expect(sql).toMatch(row);
      });
    });
  }
});
