/**
 * Generates the "seed the Wellness+ defaults" SQL block from
 * `DefaultMembership.ts`, so the migrations and the in-code defaults cannot
 * drift apart (NFR-OPS-04, NFR-MNT-01). Tested against the blocks committed
 * between `-- BEGIN GENERATED MEMBERSHIP SEED` and `-- END GENERATED MEMBERSHIP SEED` in:
 *   - prisma/migrations/20261018100000_m4_wellness_settings/migration.sql
 *   - prisma/mysql_migration_m4_wellness_settings.sql
 *   - prisma/mysql_upgrade_to_current.sql
 * Regenerate with:
 *   npx ts-node -r tsconfig-paths/register scripts/generate-membership-seed-sql.ts
 *
 * Every INSERT is guarded by "this workspace has none yet", so the block is
 * safe to run twice and leaves an Administrator's later changes alone. It
 * selects from the live `Tenant` table, so it also seeds a workspace created
 * before the deploy.
 */
import {
  DEFAULT_BENEFITS,
  DEFAULT_MEMBERSHIP_SETTINGS,
  DEFAULT_RELATIONSHIPS,
  DEFAULT_TIER_SETTINGS,
  defaultBenefitPercent,
} from '../src/membership/domain/DefaultMembership';
import { TIERS } from '../src/membership/domain/Tier';

export const BEGIN = '-- BEGIN GENERATED MEMBERSHIP SEED';
export const END = '-- END GENERATED MEMBERSHIP SEED';

const q = (text: string) => `'${text.replace(/'/g, "''")}'`;
const num = (value: string | null) => (value === null ? 'NULL' : value);
const int = (value: number | null) => (value === null ? 'NULL' : String(value));

const discountRows = () =>
  DEFAULT_BENEFITS.flatMap((b) =>
    TIERS.flatMap((tier) => {
      const percent = defaultBenefitPercent(b, tier);
      return percent === null ? [] : [{ nameEn: b.nameEn, tier, percent }];
    })
  );

export function generatePostgresMembershipSeedSql(): string {
  const s = DEFAULT_MEMBERSHIP_SETTINGS;
  const lines = [
    BEGIN,
    'INSERT INTO "TierSetting" ("tenantId", "tier", "labelSq", "labelEn", "colour", "fee", "termMonths", "updatedAt")',
    'SELECT t."id", v."tier", v."labelsq", v."labelen", v."colour", v."fee"::numeric(12,2), v."termmonths"::integer, CURRENT_TIMESTAMP',
    'FROM "Tenant" t',
    'CROSS JOIN (VALUES',
    DEFAULT_TIER_SETTINGS.map((d) => `  (${q(d.tier)}, ${q(d.labelSq)}, ${q(d.labelEn)}, ${q(d.colour)}, ${num(d.fee)}, ${int(d.termMonths)})`).join(',\n'),
    ') AS v("tier", "labelsq", "labelen", "colour", "fee", "termmonths")',
    'WHERE NOT EXISTS (SELECT 1 FROM "TierSetting" x WHERE x."tenantId" = t."id");',
    '',
    'INSERT INTO "MembershipSettings" ("tenantId", "familyDiscountPercent", "graceDays", "expiringSoonDays", "memberPrefix", "receiptPrefix", "vipReviewNoticeDays", "updatedAt")',
    `SELECT t."id", ${s.familyDiscountPercent}, ${s.graceDays}, ${s.expiringSoonDays}, ${q(s.memberPrefix)}, ${q(s.receiptPrefix)}, ${s.vipReviewNoticeDays}, CURRENT_TIMESTAMP`,
    'FROM "Tenant" t',
    'WHERE NOT EXISTS (SELECT 1 FROM "MembershipSettings" x WHERE x."tenantId" = t."id");',
    '',
    'INSERT INTO "FamilyRelationship" ("id", "tenantId", "nameSq", "nameEn", "order")',
    'SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord"',
    'FROM "Tenant" t',
    'CROSS JOIN (VALUES',
    DEFAULT_RELATIONSHIPS.map((r, i) => `  (${q(r.nameSq)}, ${q(r.nameEn)}, ${i + 1})`).join(',\n'),
    ') AS v("namesq", "nameen", "ord")',
    'WHERE NOT EXISTS (SELECT 1 FROM "FamilyRelationship" x WHERE x."tenantId" = t."id");',
    '',
    'INSERT INTO "BenefitService" ("id", "tenantId", "nameSq", "nameEn", "order")',
    'SELECT gen_random_uuid()::text, t."id", v."namesq", v."nameen", v."ord"',
    'FROM "Tenant" t',
    'CROSS JOIN (VALUES',
    DEFAULT_BENEFITS.map((b, i) => `  (${q(b.nameSq)}, ${q(b.nameEn)}, ${i + 1})`).join(',\n'),
    ') AS v("namesq", "nameen", "ord")',
    'WHERE NOT EXISTS (SELECT 1 FROM "BenefitService" x WHERE x."tenantId" = t."id");',
    '',
    '-- Only a workspace with no discount at all gets the seeded ones, so a re-run never',
    '-- puts back a discount the Administrator cleared.',
    'INSERT INTO "BenefitDiscount" ("serviceId", "tier", "percent")',
    'SELECT s."id", v."tier", v."percent"::numeric(5,2)',
    'FROM (VALUES',
    discountRows().map((d) => `  (${q(d.nameEn)}, ${q(d.tier)}, ${d.percent})`).join(',\n'),
    ') AS v("nameen", "tier", "percent")',
    'JOIN "BenefitService" s ON s."nameEn" = v."nameen"',
    'WHERE NOT EXISTS (',
    '  SELECT 1 FROM "BenefitDiscount" d JOIN "BenefitService" s2 ON s2."id" = d."serviceId" WHERE s2."tenantId" = s."tenantId"',
    ');',
    END,
  ];
  return lines.join('\n');
}

export function generateMysqlMembershipSeedSql(): string {
  const s = DEFAULT_MEMBERSHIP_SETTINGS;
  const union = (rows: string[]) => rows.join('\n  UNION ALL\n');
  const lines = [
    BEGIN,
    'INSERT INTO `TierSetting` (`tenantId`, `tier`, `labelSq`, `labelEn`, `colour`, `fee`, `termMonths`, `updatedAt`)',
    'SELECT t.id, v.tier, v.labelsq, v.labelen, v.colour, v.fee, v.termmonths, NOW(3)',
    'FROM `Tenant` t',
    'CROSS JOIN (',
    union(
      DEFAULT_TIER_SETTINGS.map((d, i) =>
        i === 0
          ? `  SELECT ${q(d.tier)} AS tier, ${q(d.labelSq)} AS labelsq, ${q(d.labelEn)} AS labelen, ${q(d.colour)} AS colour, ${num(d.fee)} AS fee, ${int(d.termMonths)} AS termmonths`
          : `  SELECT ${q(d.tier)}, ${q(d.labelSq)}, ${q(d.labelEn)}, ${q(d.colour)}, ${num(d.fee)}, ${int(d.termMonths)}`
      )
    ),
    ') v',
    'WHERE NOT EXISTS (SELECT 1 FROM `TierSetting` x WHERE x.tenantId = t.id);',
    '',
    'INSERT INTO `MembershipSettings` (`tenantId`, `familyDiscountPercent`, `graceDays`, `expiringSoonDays`, `memberPrefix`, `receiptPrefix`, `vipReviewNoticeDays`, `updatedAt`)',
    `SELECT t.id, ${s.familyDiscountPercent}, ${s.graceDays}, ${s.expiringSoonDays}, ${q(s.memberPrefix)}, ${q(s.receiptPrefix)}, ${s.vipReviewNoticeDays}, NOW(3)`,
    'FROM `Tenant` t',
    'WHERE NOT EXISTS (SELECT 1 FROM `MembershipSettings` x WHERE x.tenantId = t.id);',
    '',
    'INSERT INTO `FamilyRelationship` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)',
    'SELECT UUID(), t.id, v.namesq, v.nameen, v.ord',
    'FROM `Tenant` t',
    'CROSS JOIN (',
    union(DEFAULT_RELATIONSHIPS.map((r, i) => (i === 0 ? `  SELECT ${q(r.nameSq)} AS namesq, ${q(r.nameEn)} AS nameen, 1 AS ord` : `  SELECT ${q(r.nameSq)}, ${q(r.nameEn)}, ${i + 1}`))),
    ') v',
    'WHERE NOT EXISTS (SELECT 1 FROM `FamilyRelationship` x WHERE x.tenantId = t.id);',
    '',
    'INSERT INTO `BenefitService` (`id`, `tenantId`, `nameSq`, `nameEn`, `order`)',
    'SELECT UUID(), t.id, v.namesq, v.nameen, v.ord',
    'FROM `Tenant` t',
    'CROSS JOIN (',
    union(DEFAULT_BENEFITS.map((b, i) => (i === 0 ? `  SELECT ${q(b.nameSq)} AS namesq, ${q(b.nameEn)} AS nameen, 1 AS ord` : `  SELECT ${q(b.nameSq)}, ${q(b.nameEn)}, ${i + 1}`))),
    ') v',
    'WHERE NOT EXISTS (SELECT 1 FROM `BenefitService` x WHERE x.tenantId = t.id);',
    '',
    '-- Only a workspace with no discount at all gets the seeded ones, so a re-run never',
    '-- puts back a discount the Administrator cleared.',
    'INSERT INTO `BenefitDiscount` (`serviceId`, `tier`, `percent`)',
    'SELECT s.id, v.tier, v.percent',
    'FROM (',
    union(discountRows().map((d, i) => (i === 0 ? `  SELECT ${q(d.nameEn)} AS nameen, ${q(d.tier)} AS tier, ${d.percent} AS percent` : `  SELECT ${q(d.nameEn)}, ${q(d.tier)}, ${d.percent}`))),
    ') v',
    'JOIN `BenefitService` s ON s.nameEn = v.nameen',
    'WHERE NOT EXISTS (',
    '  SELECT 1 FROM `BenefitDiscount` d JOIN `BenefitService` s2 ON s2.id = d.serviceId WHERE s2.tenantId = s.tenantId',
    ');',
    END,
  ];
  return lines.join('\n');
}

if (require.main === module) {
  console.log('--- POSTGRES ---\n' + generatePostgresMembershipSeedSql() + '\n\n--- MYSQL ---\n' + generateMysqlMembershipSeedSql());
}
