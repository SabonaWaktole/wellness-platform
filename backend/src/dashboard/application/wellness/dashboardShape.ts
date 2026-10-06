import { Money } from '../../../pricing/domain/Money';
import { DayRange } from '../../domain/PerformancePeriod';

/** Which list a figure opens, and the filters it opens it with (FR-DSH-05). The screen turns it into a route. */
export interface DashboardLink {
  target: 'FOLLOW_UPS' | 'DEALS' | 'OFFERS' | 'PAYMENTS' | 'RENEWALS';
  filters: Record<string, string | string[]>;
}

export type FigureFormat = 'count' | 'money' | 'percent';

/** `period` figures follow the period selector; `asOfNow` ones describe the situation now (FR-DSH-03). */
export interface Figure {
  key: string;
  /** English fallback; the screen translates by `key`. */
  label: string;
  /** A count, a money string with two decimals, a percentage, or `null` ("—") when there is nothing to divide. */
  value: number | string | null;
  format: FigureFormat;
  basis: 'period' | 'asOfNow';
  link: DashboardLink | null;
}

export interface ChartPoint {
  key: string;
  label: string;
  count: number;
  /** Money with two decimals. Absent for a viewer without `commercial.view`. */
  annualValue?: string;
}

export type DashboardKind = 'SALES_USER' | 'SALES_MANAGER' | 'ADMINISTRATOR' | 'CEO' | 'RECEPTION';

export interface DashboardResponse {
  kind: DashboardKind;
  period: { preset: string; from: string; to: string };
  /** The time of the request; nothing is stored (FR-DSH-07). */
  calculatedAt: string;
  figures: Figure[];
  tables: Record<string, unknown[]>;
  charts: Record<string, ChartPoint[]>;
  /** True when the workspace has nothing to show for this viewer: the screen shows the empty state, not zeros (FR-DSH-06). */
  empty: boolean;
}

export const count = (key: string, label: string, value: number, basis: Figure['basis'], link: DashboardLink | null = null): Figure => ({
  key,
  label,
  value,
  format: 'count',
  basis,
  link,
});

export const money = (key: string, label: string, value: Money, basis: Figure['basis'], link: DashboardLink | null = null): Figure => ({
  key,
  label,
  value: value.toString(),
  format: 'money',
  basis,
  link,
});

export const percent = (key: string, label: string, value: number | null, basis: Figure['basis'], link: DashboardLink | null = null): Figure => ({
  key,
  label,
  value,
  format: 'percent',
  basis,
  link,
});

export const periodOf = (preset: string, days: DayRange) => ({ preset, from: days.from, to: days.to });

/** Nothing to show: every count is zero and every money figure is 0.00. */
export const hasNothing = (figures: readonly Figure[]): boolean =>
  figures.every((figure) => figure.value === null || figure.value === 0 || figure.value === '0.00');
