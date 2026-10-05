/** The role dashboards (M3 Slice 13, FR-DSH-01 to 10). The server decides every figure; the screen shows them. */
export const DASHBOARD_PRESETS = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as const;
export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number];

export type DashboardKind = 'SALES_USER' | 'SALES_MANAGER' | 'ADMINISTRATOR' | 'CEO' | 'RECEPTION';

/** Which list a figure opens, and with which filters (FR-DSH-05). */
export interface DashboardLink {
  target: 'FOLLOW_UPS' | 'DEALS' | 'OFFERS' | 'PAYMENTS' | 'RENEWALS';
  filters: Record<string, string | string[]>;
}

/** A figure the viewer may not see is not in the list at all (FR-DSH-08). */
export interface DashboardFigure {
  key: string;
  label: string;
  /** A count, a money string, a percentage, or null ("—") when there is nothing to divide. */
  value: number | string | null;
  format: 'count' | 'money' | 'percent';
  /** `period` figures follow the period selector, `asOfNow` ones do not (FR-DSH-03). */
  basis: 'period' | 'asOfNow';
  link: DashboardLink | null;
}

export interface DashboardPoint {
  key: string;
  label: string;
  labelSq?: string | null;
  labelEn?: string | null;
  count: number;
  /** Absent without `commercial.view`. */
  annualValue?: string;
}

export interface SalespersonRow {
  salesperson: { id: string; name: string; isActive: boolean };
  leads: number;
  activeDeals: number;
  followUpsDueToday?: number;
  followUpsDueNext7Days?: number;
  followUpsOverdue?: number;
  offersCreated: number;
  offersSent: number;
  dealsWon: number;
  dealsLost: number;
  conversionRate: number | null;
  salesValue?: string;
  calls: number;
  emails: number;
  visits: number;
  meetings: number;
}

export interface DashboardData {
  kind: DashboardKind;
  period: { preset: DashboardPreset; from: string; to: string };
  calculatedAt: string;
  figures: DashboardFigure[];
  tables: { dealsByStage?: DashboardPoint[]; perSalesperson?: SalespersonRow[]; lostReasons?: DashboardPoint[] };
  charts: { pipeline?: DashboardPoint[]; lostReasons?: DashboardPoint[] };
  /** Nothing to show yet: the screen explains it instead of showing zeros (FR-DSH-06). */
  empty: boolean;
}

export interface DashboardFilters {
  preset: DashboardPreset;
  from?: string;
  to?: string;
  salespersonId?: string;
  areaId?: string;
  cityId?: string;
}
