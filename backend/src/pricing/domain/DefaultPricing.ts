/**
 * The pricing configuration every new workspace starts with: Wellness
 * Albania's proposed model (SRS §4.1, Figure 1) and the SRS answers to Q1, Q2,
 * Q3, Q4 and Q7. The Administrator changes every value from Settings → Pricing
 * (FR-PCF-01..07).
 *
 * `PrismaPricingSeeder` writes these for new workspaces; the migration
 * `20260930200000_m2_pricing_config` and `mysql_migration_m2_pricing_config.sql`
 * write the same values for workspaces that already exist.
 * `DefaultPricing.test.ts` keeps them all in step.
 *
 * Amounts and percentages are strings with two decimals, as they are stored
 * (NFR-ACC-02).
 */
export interface DefaultEmployeeBand {
  minEmployees: number;
  maxEmployees: number;
  baseFee: string;
  perEmployeeFee: string;
}

export interface DefaultRiskSurcharge {
  /** The `level` of the M1 risk level it belongs to (Q4). */
  riskLevel: number;
  percent: string;
}

export type FrequencyPricingType = 'PERCENT' | 'FIXED';

export interface DefaultVisitFrequency {
  nameSq: string;
  nameEn: string;
  visitsPerYear: number | null;
  pricingType: FrequencyPricingType;
  /** A percentage of the base fee (PERCENT) or a fixed monthly amount (FIXED). */
  value: string;
}

export interface DefaultPriceZone {
  nameSq: string;
  nameEn: string;
  surchargePercent: string;
  /** Matched by area and city name against the M1 city list. */
  cities: { area: string; city: string }[];
}

/** Q1: one band up to 10 employees; above it the price is "on request". */
export const DEFAULT_EMPLOYEE_BANDS: DefaultEmployeeBand[] = [
  { minEmployees: 1, maxEmployees: 10, baseFee: '30.00', perEmployeeFee: '8.00' },
];

/** Q4: Level 1 (Low) 0%, Level 2 (Medium) 10%, Level 3 (High) 20%. */
export const DEFAULT_RISK_SURCHARGES: DefaultRiskSurcharge[] = [
  { riskLevel: 1, percent: '0.00' },
  { riskLevel: 2, percent: '10.00' },
  { riskLevel: 3, percent: '20.00' },
];

/** FR-PCF-04; Q2: ad hoc visits are a fixed €15.00 a month. */
export const DEFAULT_VISIT_FREQUENCIES: DefaultVisitFrequency[] = [
  { nameSq: '1 herë në vit', nameEn: 'Once a year', visitsPerYear: 1, pricingType: 'PERCENT', value: '0.00' },
  { nameSq: '2 herë në vit', nameEn: 'Twice a year', visitsPerYear: 2, pricingType: 'PERCENT', value: '20.00' },
  { nameSq: '4 herë në vit', nameEn: '4 times a year', visitsPerYear: 4, pricingType: 'PERCENT', value: '35.00' },
  { nameSq: '6 herë në vit', nameEn: '6 times a year', visitsPerYear: 6, pricingType: 'PERCENT', value: '50.00' },
  { nameSq: 'Çdo muaj', nameEn: 'Monthly', visitsPerYear: 12, pricingType: 'PERCENT', value: '100.00' },
  { nameSq: 'Sipas nevojës', nameEn: 'Ad hoc', visitsPerYear: null, pricingType: 'FIXED', value: '15.00' },
];

/** FR-PCF-05; Q3: Tiranë is in both Tirana zones, and the salesperson chooses. */
export const DEFAULT_PRICE_ZONES: DefaultPriceZone[] = [
  { nameSq: 'Tirana qendër', nameEn: 'Tirana centre', surchargePercent: '0.00', cities: [{ area: 'Tiranë', city: 'Tiranë' }] },
  { nameSq: 'Tirana periferi', nameEn: 'Tirana suburbs', surchargePercent: '15.00', cities: [{ area: 'Tiranë', city: 'Tiranë' }] },
  {
    nameSq: 'Kamëz dhe Vorë',
    nameEn: 'Kamëz and Vorë',
    surchargePercent: '30.00',
    cities: [
      { area: 'Tiranë', city: 'Kamëz' },
      { area: 'Tiranë', city: 'Vorë' },
    ],
  },
  {
    nameSq: 'Elbasan dhe Durrës',
    nameEn: 'Elbasan and Durrës',
    surchargePercent: '100.00',
    cities: [
      { area: 'Elbasan', city: 'Elbasan' },
      { area: 'Durrës', city: 'Durrës' },
    ],
  },
];

/** Q7: a 10% placeholder until Wellness Albania confirms it. */
export const DEFAULT_DISCOUNT_CAP_PERCENT = '10.00';

export const DEFAULT_PRICING_CURRENCY = 'EUR';
