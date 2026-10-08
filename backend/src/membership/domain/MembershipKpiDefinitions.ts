import { addDays, startOfDay } from '../../contracts/domain/calendarDay';
import { PricingDecimal } from '../../pricing/domain/decimal';
import { Money } from '../../pricing/domain/Money';
import { Percent } from '../../pricing/domain/Percent';
import { expiringSoon } from './expiringSoon';
import type { TermSource } from './MemberTerm';
import type { PaymentKind } from './termDates';
import { type Tier, tierRank } from './Tier';

/** The pure formulas of SRS 9.3, on counts and sums. Reports call them (Slice 14). */

export interface PaymentFigure {
  kind: PaymentKind;
  tier: Tier;
  amount: Money;
  voided: boolean;
}

export interface RevenueRow {
  kind: PaymentKind;
  tier: Tier;
  count: number;
  total: Money;
}

/** Payments not voided, grouped by kind and tier in order of first appearance. */
export function revenueRows(payments: readonly PaymentFigure[]): RevenueRow[] {
  const rows = new Map<string, RevenueRow>();
  for (const p of payments) {
    if (p.voided) continue;
    const key = `${p.kind}:${p.tier}`;
    const row = rows.get(key) ?? { kind: p.kind, tier: p.tier, count: 0, total: Money.zero() };
    rows.set(key, { ...row, count: row.count + 1, total: row.total.add(p.amount) });
  }
  return [...rows.values()];
}

export const totalRow = (rows: readonly RevenueRow[]): { count: number; total: Money } =>
  rows.reduce((acc, r) => ({ count: acc.count + r.count, total: acc.total.add(r.total) }), { count: 0, total: Money.zero() });

/** Renewed divided by due, in percent with two decimals; null (a dash) when none are due. */
export function renewalRate(renewed: number, due: number): Percent | null {
  if (due === 0) return null;
  return Percent.of(new PricingDecimal(renewed).dividedBy(due).times(100).toDecimalPlaces(2, PricingDecimal.ROUND_HALF_UP).toString());
}

export interface PaidTermFigure {
  tier: Tier;
  endsOn: Date;
  /** Date of a renewal payment, not voided, for this term. */
  renewalPaidOn: Date | null;
}

/**
 * Renewals due: Silver and Gold paid terms whose end date plus grace days falls
 * in the period. Renewed: of those, with a renewal recorded by that date.
 */
export function renewalFigures(
  terms: readonly PaidTermFigure[],
  graceDays: number,
  period: { from: Date; to: Date }
): { due: number; renewed: number } {
  let due = 0;
  let renewed = 0;
  for (const t of terms) {
    if (t.tier !== 'SILVER' && t.tier !== 'GOLD') continue;
    const cutoff = startOfDay(addDays(t.endsOn, graceDays));
    if (cutoff < startOfDay(period.from) || cutoff > startOfDay(period.to)) continue;
    due += 1;
    if (t.renewalPaidOn !== null && startOfDay(t.renewalPaidOn) <= cutoff) renewed += 1;
  }
  return { due, renewed };
}

export type TierChangeReason =
  | 'PURCHASE'
  | 'RENEWAL'
  | 'UPGRADE'
  | 'NOT_RENEWED'
  | 'COMPANY_CONTRACT_ENDED'
  | 'LEFT_COMPANY'
  | 'VIP_APPROVED'
  | 'VIP_ENDED'
  | 'IMPORT'
  | 'CORRECTION';

const DOWNGRADE_REASONS: ReadonlySet<TierChangeReason> = new Set([
  'NOT_RENEWED',
  'COMPANY_CONTRACT_ENDED',
  'LEFT_COMPANY',
  'VIP_ENDED',
]);

export interface TierHistoryFigure {
  fromTier: Tier;
  toTier: Tier;
  reason: TierChangeReason;
}

/** History rows where the tier decreased, for the four downgrade reasons; corrections are not counted. */
export function downgradeCount(rows: readonly TierHistoryFigure[]): {
  total: number;
  byPath: Record<string, number>;
  byReason: Record<string, number>;
} {
  const byPath: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (!DOWNGRADE_REASONS.has(r.reason) || tierRank(r.toTier) >= tierRank(r.fromTier)) continue;
    total += 1;
    const path = `${r.fromTier}>${r.toTier}`;
    byPath[path] = (byPath[path] ?? 0) + 1;
    byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  }
  return { total, byPath, byReason };
}

/** Paid terms ending within the expiring soon window (FR-TIR-10). */
export const expiringMembershipCount = (
  terms: ReadonlyArray<{ source: TermSource; endsOn: Date | null }>,
  today: Date,
  windowDays: number
): number => terms.filter((t) => t.source === 'PAID' && expiringSoon(t.endsOn, today, windowDays)).length;
