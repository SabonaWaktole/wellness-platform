import { readFileSync } from 'fs';
import * as path from 'path';
import {
  DEFAULT_DISCOUNT_CAP_PERCENT,
  DEFAULT_EMPLOYEE_BANDS,
  DEFAULT_PRICE_ZONES,
  DEFAULT_RISK_SURCHARGES,
  DEFAULT_VISIT_FREQUENCIES,
} from '../../../src/pricing/domain/DefaultPricing';
import { DEFAULT_AREAS, DEFAULT_RISK_LEVELS } from '../../../src/lookups/domain/DefaultLookups';
import {
  FREQ_AD_HOC,
  FREQ_FOUR_YEAR,
  FREQ_MONTHLY,
  FREQ_ONE_YEAR,
  FREQ_SIX_YEAR,
  FREQ_TWO_YEAR,
  RISK_HIGH,
  RISK_LOW,
  RISK_MEDIUM,
  ZONE_CENTER,
  ZONE_ELBASAN_DURRES,
  ZONE_KAMZA_VORE,
  ZONE_SUBURBS,
  figure1Config,
} from './pricingModelFigure1';

const prismaDir = path.resolve(__dirname, '../../../prisma');
const read = (file: string) => readFileSync(path.join(prismaDir, file), 'utf8');

/** A SQL numeric literal for a two-decimal string, as the migrations write it. */
const num = (value: string) => value.replace('.', '\\.');

/** A VALUES row (Postgres) or a `SELECT x AS a, y AS b` row (MySQL) of these literals. */
const sqlRow = (...literals: string[]) => new RegExp(`\\b${literals.join('(?: AS \\w+)?, ')}\\b`);

/**
 * New workspaces get their pricing from `PrismaPricingSeeder`; existing ones
 * from the Slice 3 migrations. These tests keep every source in step with
 * each other and with Wellness Albania's Figure 1 model.
 */
describe('Default pricing configuration', () => {
  it('FR-PCF-01 the seeded band is Figure 1: 1–10 employees, €30.00 plus €8.00 per extra employee', () => {
    expect(DEFAULT_EMPLOYEE_BANDS).toEqual([
      {
        minEmployees: figure1Config.bands[0].min,
        maxEmployees: figure1Config.bands[0].max,
        baseFee: figure1Config.bands[0].baseFee.toString(),
        perEmployeeFee: figure1Config.bands[0].perEmployeeFee.toString(),
      },
    ]);
  });

  it('FR-PCF-02 the seeded risk surcharges are Figure 1 (Q4: level 1 low, 2 medium, 3 high) and cover every default risk level', () => {
    const byLevel = Object.fromEntries(DEFAULT_RISK_SURCHARGES.map((s) => [s.riskLevel, s.percent]));
    expect(byLevel).toEqual({
      1: figure1Config.riskSurcharges[RISK_LOW].toString(),
      2: figure1Config.riskSurcharges[RISK_MEDIUM].toString(),
      3: figure1Config.riskSurcharges[RISK_HIGH].toString(),
    });
    expect(DEFAULT_RISK_SURCHARGES.map((s) => s.riskLevel)).toEqual(DEFAULT_RISK_LEVELS.map((r) => r.level));
  });

  it('FR-PCF-04 the seeded visit frequencies are Figure 1, with ad hoc a fixed €15.00 a month (Q2)', () => {
    const figure1 = [FREQ_ONE_YEAR, FREQ_TWO_YEAR, FREQ_FOUR_YEAR, FREQ_SIX_YEAR, FREQ_MONTHLY, FREQ_AD_HOC].map((id) => {
      const pricing = figure1Config.frequencies[id];
      return pricing.type === 'PERCENT'
        ? { pricingType: 'PERCENT', value: pricing.value.toString() }
        : { pricingType: 'FIXED', value: pricing.amount.toString() };
    });
    expect(DEFAULT_VISIT_FREQUENCIES.map(({ pricingType, value }) => ({ pricingType, value }))).toEqual(figure1);
  });

  it('FR-PCF-05 the seeded zones are Figure 1, and every zone city is a default city', () => {
    expect(DEFAULT_PRICE_ZONES.map((z) => z.surchargePercent)).toEqual(
      [ZONE_CENTER, ZONE_SUBURBS, ZONE_KAMZA_VORE, ZONE_ELBASAN_DURRES].map((id) => figure1Config.zones[id].toString())
    );
    for (const zone of DEFAULT_PRICE_ZONES) {
      expect(zone.cities.length).toBeGreaterThan(0);
      for (const { area, city } of zone.cities) {
        const defaultArea = DEFAULT_AREAS.find((a) => a.nameSq === area);
        expect(defaultArea?.cities.map((c) => c.nameSq)).toContain(city);
      }
    }
  });

  it('FR-PCF-05 Tiranë is in both Tirana zones (Q3), so the salesperson chooses', () => {
    const withTirane = DEFAULT_PRICE_ZONES.filter((z) => z.cities.some((c) => c.area === 'Tiranë' && c.city === 'Tiranë'));
    expect(withTirane.map((z) => z.nameEn)).toEqual(['Tirana centre', 'Tirana suburbs']);
  });

  it('FR-PCF-07 the seeded discount cap is Figure 1 (Q7: 10%)', () => {
    expect(DEFAULT_DISCOUNT_CAP_PERCENT).toBe(figure1Config.discountCap.toString());
  });

  const migrations = {
    postgres: read('migrations/20260930200000_m2_pricing_config/migration.sql'),
    'mysql (standalone)': read('mysql_migration_m2_pricing_config.sql'),
    'mysql (upgrade script)': read('mysql_upgrade_to_current.sql'),
  };

  for (const [name, sql] of Object.entries(migrations)) {
    it(`FR-PCF-01 FR-PCF-02 FR-PCF-04 FR-PCF-05 FR-PCF-07 the ${name} seed carries the same pricing values, in the same order`, () => {
      for (const band of DEFAULT_EMPLOYEE_BANDS) {
        expect(sql).toMatch(sqlRow(`${band.minEmployees}`, `${band.maxEmployees}`, num(band.baseFee), num(band.perEmployeeFee)));
      }
      for (const surcharge of DEFAULT_RISK_SURCHARGES) {
        expect(sql).toMatch(sqlRow(`${surcharge.riskLevel}`, num(surcharge.percent)));
      }
      DEFAULT_VISIT_FREQUENCIES.forEach((frequency, index) => {
        const visits = frequency.visitsPerYear === null ? 'NULL' : String(frequency.visitsPerYear);
        expect(sql).toMatch(
          new RegExp(
            `'${frequency.nameSq}'[^\\n]*'${frequency.nameEn}'[^\\n]*\\b${visits}\\b[^\\n]*'${frequency.pricingType}'[^\\n]*${num(frequency.value)}[^\\n]*\\b${index + 1}\\b`
          )
        );
      });
      DEFAULT_PRICE_ZONES.forEach((zone, index) => {
        expect(sql).toMatch(
          new RegExp(`'${zone.nameSq}'[^\\n]*'${zone.nameEn}'[^\\n]*${num(zone.surchargePercent)}[^\\n]*\\b${index + 1}\\b`)
        );
        for (const { area, city } of zone.cities) {
          expect(sql).toMatch(new RegExp(`'${zone.nameSq}'[^\\n]*'${area}'[^\\n]*'${city}'`));
        }
      });
      expect(sql).toMatch(new RegExp(`'EUR'[^\\n]*${num(DEFAULT_DISCOUNT_CAP_PERCENT)}`));
    });
  }
});
