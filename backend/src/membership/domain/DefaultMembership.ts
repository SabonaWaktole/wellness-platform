import type { Tier } from './Tier';

/**
 * The seed for a new workspace (PrismaMembershipSeeder) and the source the
 * migrations are tested against (NFR-OPS-04). SRS M4 3.2, 3.3, 6.1 and 12.3.
 */

export interface DefaultTierSetting {
  tier: Tier;
  labelSq: string;
  labelEn: string;
  colour: string;
  fee: string | null;
  termMonths: number | null;
}

export const DEFAULT_TIER_SETTINGS: readonly DefaultTierSetting[] = [
  { tier: 'BRONZE', labelSq: 'Bronz', labelEn: 'Bronze', colour: '#B26A2B', fee: null, termMonths: null },
  { tier: 'SILVER', labelSq: 'Argjend', labelEn: 'Silver', colour: '#8A939B', fee: '60.00', termMonths: 12 },
  { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227', fee: '100.00', termMonths: 12 },
  { tier: 'VIP', labelSq: 'VIP', labelEn: 'VIP', colour: '#5B3FA6', fee: null, termMonths: 12 },
];

export const DEFAULT_MEMBERSHIP_SETTINGS = {
  familyDiscountPercent: '50.00',
  graceDays: 0,
  expiringSoonDays: 30,
  memberPrefix: 'WP',
  receiptPrefix: 'RCP',
  vipReviewNoticeDays: 30,
} as const;

export const DEFAULT_RELATIONSHIPS: readonly { nameSq: string; nameEn: string }[] = [
  { nameSq: 'Bashkëshort ose partner', nameEn: 'Spouse or partner' },
  { nameSq: 'Fëmijë', nameEn: 'Child' },
  { nameSq: 'Prind', nameEn: 'Parent' },
];

export interface DefaultBenefit {
  nameSq: string;
  nameEn: string;
  /** Percent per tier as in the price list; null is "no discount". VIP equals Gold until Wellness Albania confirms (Q8). */
  bronze: string | null;
  silver: string | null;
  gold: string | null;
}

const b = (nameSq: string, nameEn: string, bronze: string | null, silver: string | null, gold: string | null): DefaultBenefit => ({
  nameSq,
  nameEn,
  bronze,
  silver,
  gold,
});

/** SRS M4 6.1, row for row. */
export const DEFAULT_BENEFITS: readonly DefaultBenefit[] = [
  b('Kontroll parandalues', 'Preventive check-up', '25.00', '50.00', '100.00'),
  b('Qasje te internisti', 'Internist access', '100.00', '100.00', '100.00'),
  b(
    'Masazh relaksues ose sportiv (ose 1 seancë fizioterapie për një gjendje ekzistuese)',
    'Relaxing or sports massage (or 1 physiotherapy session for an existing condition)',
    null,
    null,
    '100.00'
  ),
  b('Ekzaminime radiologjike', 'Radiology examinations', null, null, '50.00'),
  b('Vizita te gjinekologu', 'Gynecologist visits', '10.00', '20.00', '30.00'),
  b('Vizita te kardiologu', 'Cardiologist visits', '10.00', '20.00', '30.00'),
  b('Vizita te reumatologu', 'Rheumatologist visits', '10.00', '20.00', '30.00'),
  b('Vizita te dermatologu', 'Dermatologist visits', '10.00', '15.00', '30.00'),
  b('Vizita te endokrinologu', 'Endocrinologist visits', '10.00', '20.00', '30.00'),
  b('Vizita te pediatri', 'Pediatrician visits', '10.00', '20.00', '30.00'),
  b('Shërbime infermierore në shtëpi', 'Home nursing services', '10.00', null, '30.00'),
  b('Seanca fizioterapie dhe rehabilitimi fizik', 'Physiotherapy and physical rehabilitation sessions', '10.00', '20.00', '30.00'),
  b('Analiza laboratorike', 'Laboratory tests', null, '15.00', null),
  b('Skaner CT (të gjitha llojet)', 'CT scan (all types)', null, null, null),
];

/** The percent of a default row for a tier, VIP taking the Gold value. */
export const defaultBenefitPercent = (benefit: DefaultBenefit, tier: Tier): string | null =>
  tier === 'BRONZE' ? benefit.bronze : tier === 'SILVER' ? benefit.silver : benefit.gold;
