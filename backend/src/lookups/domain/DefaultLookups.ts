/**
 * Placeholder lists every new workspace starts with, so a fresh installation
 * is usable before Wellness Albania sends its real lists (FR-SET-10, SRS
 * §8.3). The Administrator replaces them from Settings → Lists.
 *
 * The migrations `20260928140000_add_lookup_lists` /
 * `mysql_migration_add_lookup_lists.sql` (risk levels, business types),
 * `mysql_migration_add_areas_cities.sql` (areas, cities) and
 * `mysql_migration_add_sales_lists.sql` (follow-up intervals, lost-deal
 * reasons) seed the same values for workspaces that already exist, and
 * `20260930200000_m2_pricing_config` adds the cities marked `since: 'M2'`
 * (Vorë, for the Kamëz and Vorë price zone);
 * `DefaultLookups.test.ts` keeps them all in step.
 */
export interface DefaultRiskLevel {
  level: number;
  nameSq: string;
  nameEn: string;
  description: string;
}

export interface DefaultBusinessType {
  nameSq: string;
  nameEn: string;
  /** The `level` of the risk level it belongs to. */
  riskLevel: number;
}

export interface DefaultCity {
  nameSq: string;
  nameEn: string;
  /**
   * Set on a city added after Milestone 1. Existing workspaces receive it
   * from that milestone's migration, not from the M1 area/city migration,
   * which stays as it was applied.
   */
  since?: 'M2';
}

export interface DefaultArea {
  nameSq: string;
  nameEn: string;
  cities: DefaultCity[];
}

export interface DefaultFollowUpInterval {
  days: number;
  nameSq: string;
  nameEn: string;
}

export interface DefaultLostReason {
  nameSq: string;
  nameEn: string;
}

export const DEFAULT_RISK_LEVELS: DefaultRiskLevel[] = [
  { level: 1, nameSq: 'Niveli 1', nameEn: 'Level 1', description: 'Rrezik i ulët' },
  { level: 2, nameSq: 'Niveli 2', nameEn: 'Level 2', description: 'Rrezik i mesëm' },
  { level: 3, nameSq: 'Niveli 3', nameEn: 'Level 3', description: 'Rrezik i lartë' },
];

export const DEFAULT_BUSINESS_TYPES: DefaultBusinessType[] = [
  { nameSq: 'Qendër thirrjesh', nameEn: 'Call center', riskLevel: 1 },
  { nameSq: 'Zyrë', nameEn: 'Office', riskLevel: 1 },
  { nameSq: 'Kafene', nameEn: 'Café', riskLevel: 1 },
  { nameSq: 'Dyqan', nameEn: 'Retail shop', riskLevel: 1 },
  { nameSq: 'Restorant', nameEn: 'Restaurant', riskLevel: 2 },
  { nameSq: 'Hotel', nameEn: 'Hotel', riskLevel: 2 },
  { nameSq: 'Magazinë', nameEn: 'Warehouse', riskLevel: 2 },
  { nameSq: 'Ndërtim', nameEn: 'Construction', riskLevel: 3 },
  { nameSq: 'Fabrikë', nameEn: 'Factory', riskLevel: 3 },
];

/** Albania's 12 qarqe (Q1: Area = region), each with a few of its cities. */
export const DEFAULT_AREAS: DefaultArea[] = [
  { nameSq: 'Berat', nameEn: 'Berat', cities: [{ nameSq: 'Berat', nameEn: 'Berat' }, { nameSq: 'Kuçovë', nameEn: 'Kuçovë' }, { nameSq: 'Ura Vajgurore', nameEn: 'Ura Vajgurore' }] },
  { nameSq: 'Dibër', nameEn: 'Dibër', cities: [{ nameSq: 'Peshkopi', nameEn: 'Peshkopi' }, { nameSq: 'Bulqizë', nameEn: 'Bulqizë' }, { nameSq: 'Burrel', nameEn: 'Burrel' }] },
  { nameSq: 'Durrës', nameEn: 'Durrës', cities: [{ nameSq: 'Durrës', nameEn: 'Durrës' }, { nameSq: 'Shijak', nameEn: 'Shijak' }, { nameSq: 'Krujë', nameEn: 'Krujë' }] },
  { nameSq: 'Elbasan', nameEn: 'Elbasan', cities: [{ nameSq: 'Elbasan', nameEn: 'Elbasan' }, { nameSq: 'Cërrik', nameEn: 'Cërrik' }, { nameSq: 'Librazhd', nameEn: 'Librazhd' }] },
  { nameSq: 'Fier', nameEn: 'Fier', cities: [{ nameSq: 'Fier', nameEn: 'Fier' }, { nameSq: 'Patos', nameEn: 'Patos' }, { nameSq: 'Lushnjë', nameEn: 'Lushnjë' }] },
  { nameSq: 'Gjirokastër', nameEn: 'Gjirokastër', cities: [{ nameSq: 'Gjirokastër', nameEn: 'Gjirokastër' }, { nameSq: 'Tepelenë', nameEn: 'Tepelenë' }, { nameSq: 'Përmet', nameEn: 'Përmet' }] },
  { nameSq: 'Korçë', nameEn: 'Korçë', cities: [{ nameSq: 'Korçë', nameEn: 'Korçë' }, { nameSq: 'Pogradec', nameEn: 'Pogradec' }, { nameSq: 'Bilisht', nameEn: 'Bilisht' }] },
  { nameSq: 'Kukës', nameEn: 'Kukës', cities: [{ nameSq: 'Kukës', nameEn: 'Kukës' }, { nameSq: 'Krumë', nameEn: 'Krumë' }, { nameSq: 'Has', nameEn: 'Has' }] },
  { nameSq: 'Lezhë', nameEn: 'Lezhë', cities: [{ nameSq: 'Lezhë', nameEn: 'Lezhë' }, { nameSq: 'Laç', nameEn: 'Laç' }, { nameSq: 'Rrëshen', nameEn: 'Rrëshen' }] },
  { nameSq: 'Shkodër', nameEn: 'Shkodër', cities: [{ nameSq: 'Shkodër', nameEn: 'Shkodër' }, { nameSq: 'Koplik', nameEn: 'Koplik' }, { nameSq: 'Vau i Dejës', nameEn: 'Vau i Dejës' }] },
  { nameSq: 'Tiranë', nameEn: 'Tirana', cities: [{ nameSq: 'Tiranë', nameEn: 'Tirana' }, { nameSq: 'Kamëz', nameEn: 'Kamëz' }, { nameSq: 'Kavajë', nameEn: 'Kavajë' }, { nameSq: 'Vorë', nameEn: 'Vorë', since: 'M2' }] },
  { nameSq: 'Vlorë', nameEn: 'Vlorë', cities: [{ nameSq: 'Vlorë', nameEn: 'Vlorë' }, { nameSq: 'Sarandë', nameEn: 'Sarandë' }, { nameSq: 'Himarë', nameEn: 'Himarë' }] },
];

/** FR-SET-05's own defaults: 3, 5 and 7 days. */
export const DEFAULT_FOLLOW_UP_INTERVALS: DefaultFollowUpInterval[] = [
  { days: 3, nameSq: '3 ditë', nameEn: '3 days' },
  { days: 5, nameSq: '5 ditë', nameEn: '5 days' },
  { days: 7, nameSq: '7 ditë', nameEn: '7 days' },
];

/** FR-SET-06's own example list. */
export const DEFAULT_LOST_REASONS: DefaultLostReason[] = [
  { nameSq: 'Shumë e shtrenjtë', nameEn: 'Too expensive' },
  { nameSq: 'Ka tashmë një ofrues', nameEn: 'Already has a provider' },
  { nameSq: 'Pa buxhet', nameEn: 'No budget' },
  { nameSq: 'Pa përgjigje', nameEn: 'No response' },
];
