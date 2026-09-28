/**
 * Placeholder lists every new workspace starts with, so a fresh installation
 * is usable before Wellness Albania sends its real lists (FR-SET-10, SRS
 * §8.3). The Administrator replaces them from Settings → Lists.
 *
 * The migration `20260928140000_add_lookup_lists` and
 * `mysql_migration_add_lookup_lists.sql` seed the same values for workspaces
 * that already exist; `DefaultLookups.test.ts` keeps the three in step.
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
