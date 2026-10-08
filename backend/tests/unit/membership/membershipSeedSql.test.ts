import * as fs from 'fs';
import * as path from 'path';
import {
  BEGIN,
  END,
  generateMysqlMembershipSeedSql,
  generatePostgresMembershipSeedSql,
} from '../../../scripts/generate-membership-seed-sql';
import { DEFAULT_BENEFITS, DEFAULT_RELATIONSHIPS, DEFAULT_TIER_SETTINGS, defaultBenefitPercent } from '../../../src/membership/domain/DefaultMembership';
import { TIERS } from '../../../src/membership/domain/Tier';

const prisma = (file: string) => path.join(__dirname, '../../../prisma', file);

function generatedBlockOf(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1) throw new Error(`${filePath} has no ${BEGIN}/${END} markers`);
  return content.slice(start, end + END.length);
}

describe('NFR-OPS-04 the Wellness+ seed SQL and the in-code defaults cannot drift apart', () => {
  it('the Postgres migration carries exactly what the generator produces today', () => {
    expect(generatedBlockOf(prisma('migrations/20261018100000_m4_wellness_settings/migration.sql'))).toBe(generatePostgresMembershipSeedSql());
  });

  it('the MySQL script and the combined MySQL upgrade carry exactly what the generator produces today', () => {
    expect(generatedBlockOf(prisma('mysql_migration_m4_wellness_settings.sql'))).toBe(generateMysqlMembershipSeedSql());
    expect(generatedBlockOf(prisma('mysql_upgrade_to_current.sql'))).toBe(generateMysqlMembershipSeedSql());
  });

  it('every seed INSERT is guarded so a second run adds nothing', () => {
    for (const sql of [generatePostgresMembershipSeedSql(), generateMysqlMembershipSeedSql()]) {
      const inserts = sql.match(/INSERT INTO/g)!.length;
      expect(inserts).toBe(5);
      expect(sql.match(/WHERE NOT EXISTS/g)!.length).toBeGreaterThanOrEqual(inserts);
    }
  });
});

describe('Default Wellness+ table', () => {
  it('FR-TIR-01 Bronze and VIP are free, Silver is 60.00, Gold is 100.00, all with 12 months except Bronze', () => {
    expect(DEFAULT_TIER_SETTINGS.map((t) => [t.tier, t.fee, t.termMonths])).toEqual([
      ['BRONZE', null, null],
      ['SILVER', '60.00', 12],
      ['GOLD', '100.00', 12],
      ['VIP', null, 12],
    ]);
  });

  it('FR-FAM-02 the relationship list is Spouse or partner, Child, Parent', () => {
    expect(DEFAULT_RELATIONSHIPS.map((r) => r.nameEn)).toEqual(['Spouse or partner', 'Child', 'Parent']);
  });

  // SRS M4 6.1, row for row. null is a dash in the price list.
  it.each([
    ['Preventive check-up', '25.00', '50.00', '100.00'],
    ['Internist access', '100.00', '100.00', '100.00'],
    ['Relaxing or sports massage (or 1 physiotherapy session for an existing condition)', null, null, '100.00'],
    ['Radiology examinations', null, null, '50.00'],
    ['Gynecologist visits', '10.00', '20.00', '30.00'],
    ['Cardiologist visits', '10.00', '20.00', '30.00'],
    ['Rheumatologist visits', '10.00', '20.00', '30.00'],
    ['Dermatologist visits', '10.00', '15.00', '30.00'],
    ['Endocrinologist visits', '10.00', '20.00', '30.00'],
    ['Pediatrician visits', '10.00', '20.00', '30.00'],
    ['Home nursing services', '10.00', null, '30.00'],
    ['Physiotherapy and physical rehabilitation sessions', '10.00', '20.00', '30.00'],
    ['Laboratory tests', null, '15.00', null],
    ['CT scan (all types)', null, null, null],
  ])('FR-BEN-02 %s: Bronze %s, Silver %s, Gold %s, VIP equal to Gold', (name, bronze, silver, gold) => {
    const row = DEFAULT_BENEFITS.find((b) => b.nameEn === name)!;
    expect(row).toBeDefined();
    expect(TIERS.map((tier) => defaultBenefitPercent(row, tier))).toEqual([bronze, silver, gold, gold]);
  });

  it('FR-BEN-02 there are exactly the 14 services, each named in both languages', () => {
    expect(DEFAULT_BENEFITS).toHaveLength(14);
    for (const b of DEFAULT_BENEFITS) {
      expect(b.nameSq.trim()).not.toBe('');
      expect(b.nameEn.trim()).not.toBe('');
    }
  });
});
