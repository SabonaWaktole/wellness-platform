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

/** The dashboards a user can open from the menu; Reception has none (FR-DSH-01). */
export type RoleDashboardKind = Exclude<DashboardKind, 'RECEPTION'>;

/** One part of the pricing configuration and when it last changed (FR-DSH-11). Only the cap carries a value. */
export interface PricingPartRow {
  key: 'DISCOUNT_CAP' | 'EMPLOYEE_BANDS' | 'RISK_SURCHARGES' | 'VISIT_FREQUENCIES' | 'PRICE_ZONES';
  discountCapPercent?: string;
  count?: number;
  lastChangedAt: string | null;
}

export interface RoleUsageRow {
  roleId: string;
  key: string;
  nameSq: string;
  nameEn: string | null;
  activeUsers: number;
  inactiveUsers: number;
}

export interface AttentionRow {
  key: 'CITY_NO_ZONE' | 'ROLE_NO_USERS';
  count: number;
  examples: Array<{ id: string; name: string }>;
}

export interface RecentChangeRow {
  id: string;
  at: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityLabel: string | null;
}

/** The Performance screen's row, as the CEO's team table shows it. The value is absent without `commercial.view`. */
export interface TeamRow {
  salesperson: { id: string; name: string; isActive: boolean };
  figures: {
    dealsWon: number;
    dealsLost: number;
    conversionRate: number | null;
    offersCreated: number;
    offersSent: number;
    calls: number;
    emails: number;
    visits: number;
    meetings: number;
    followUpsOverdue: number;
    totalValue?: string;
  };
}

export interface ContractGroupRow {
  key: 'active' | 'expired' | 'expiringSoon';
  count: number;
  annualValue?: string;
}

export interface PaymentStatusRow {
  status: string;
  count: number;
  amount?: string;
  paidAmount?: string;
  outstanding?: string;
}

export interface DashboardData {
  kind: DashboardKind;
  period: { preset: DashboardPreset; from: string; to: string };
  calculatedAt: string;
  figures: DashboardFigure[];
  tables: {
    dealsByStage?: DashboardPoint[];
    perSalesperson?: SalespersonRow[];
    lostReasons?: DashboardPoint[];
    // Administrator (FR-DSH-11)
    pricing?: PricingPartRow[];
    usersPerRole?: RoleUsageRow[];
    attention?: AttentionRow[];
    recentChanges?: RecentChangeRow[];
    // CEO (FR-DSH-12)
    team?: TeamRow[];
    contracts?: ContractGroupRow[];
    payments?: PaymentStatusRow[];
    companiesPerStatus?: DashboardPoint[];
  };
  charts: { pipeline?: DashboardPoint[]; lostReasons?: DashboardPoint[]; salesPerMonth?: DashboardPoint[]; companiesPerStatus?: DashboardPoint[] };
  /** The place for the Wellness+ indicators: always empty until Milestone 4, and not drawn (FR-DSH-12). */
  wellnessPlus?: never[];
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
