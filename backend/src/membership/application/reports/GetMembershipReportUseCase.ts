import type { AccessContext } from '../../../access/domain/AccessContext';
import { bucketsOf, instantsOf, InvalidPeriodError, PERIOD_PRESETS, type PeriodPreset, resolvePeriod, workspaceToday } from '../../../dashboard/domain/PerformancePeriod';
import { Money } from '../../../pricing/domain/Money';
import { downgradeCount, renewalFigures, renewalRate, type RevenueRow, totalRow } from '../../domain/MembershipKpiDefinitions';
import { TIERS, type Tier, tierRank } from '../../domain/Tier';
import { MEMBERS_PAYMENTS_VIEW, MEMBERS_REPORTS_VIEW } from '../membershipPermissions';
import type { IMembershipSettingsStore } from '../ports/IMembershipSettingsStore';
import type {
  EmployerRow,
  IMembershipReportReader,
  ReportFilters,
  ReportQuery,
  WorkingListRow,
} from './ports/IMembershipReportReader';

export class InvalidReportFilterError extends InvalidPeriodError {
  readonly code = 'INVALID_REPORT_FILTER';
}

export interface MembershipReportParams extends ReportFilters {
  preset?: PeriodPreset;
  from?: string;
  to?: string;
}

/** A figure's share of a total, two decimals, or null when there is no total (a dash). */
const share = (count: number, total: number): string | null => renewalRate(count, total)?.toString() ?? null;

const countOf = (rows: ReadonlyArray<{ tier: Tier; count: number }>, tier: Tier) => rows.find((r) => r.tier === tier)?.count ?? 0;

export interface MembershipReport {
  period: { preset: PeriodPreset; from: string; to: string };
  asOf: string;
  filters: ReportFilters;
  /** Active members, as of now (§9.3). */
  active: {
    basis: 'asOfNow';
    total: number;
    perTier: Array<{ tier: Tier; count: number; share: string | null }>;
    /** Active members per tier at the end of each month of the period (FR-RPT-02). */
    monthly: Array<{ month: string; total: number; perTier: Array<{ tier: Tier; count: number }> }>;
  };
  segments: { basis: 'asOfNow'; corporate: { count: number; share: string | null }; individual: { count: number; share: string | null } };
  newMembers: { basis: 'period'; total: number; corporate: number; individual: number; newPaidMemberships: number };
  renewals: {
    basis: 'period';
    due: number;
    renewed: number;
    notRenewed: number;
    /** Percent with two decimals, or null for a dash. */
    rate: string | null;
    perTier: Array<{ tier: Tier; due: number; renewed: number; notRenewed: number; rate: string | null }>;
  };
  upgrades: { basis: 'period'; count: number; amount?: string; perPath: Array<{ path: string; count: number; amount?: string }> };
  downgrades: {
    basis: 'period';
    total: number;
    perPath: Array<{ path: string; count: number }>;
    perReason: Array<{ reason: string; count: number }>;
  };
  employers: { basis: 'asOfNow'; rows: EmployerRow[]; totals: { members: number; sponsoredSilver: number; upgradedToPaid: number; formerEmployees: number } };
  /** Only with "Members: view payments" (FR-RPT-08). */
  revenue?: { basis: 'period'; count: number; total: string; rows: Array<{ kind: string; tier: Tier; count: number; total: string }> };
  lists: {
    expiring: WorkingListRow[];
    vipReviews: WorkingListRow[];
    formerEmployees: WorkingListRow[];
  };
}

/**
 * The Wellness+ reports page (Slice 14, FR-RPT-01..09). Every figure is
 * calculated here and in the reader's queries from the formulas of
 * `MembershipKpiDefinitions` (§9.3), so the CEO dashboard (Slice 15) can call
 * the same use case and cannot differ.
 */
export class GetMembershipReportUseCase {
  constructor(
    private readonly reader: IMembershipReportReader,
    private readonly settings: IMembershipSettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; params: MembershipReportParams }): Promise<MembershipReport> {
    const { access, tenantId, timezone, params } = input;
    access.ensure(MEMBERS_REPORTS_VIEW, 'You do not have permission to view the Wellness+ reports.');
    const filters = await this.checkedFilters(tenantId, params);
    const now = this.now();
    const today = workspaceToday(now, timezone);
    const preset = params.preset ?? 'THIS_MONTH';
    if (!PERIOD_PRESETS.includes(preset)) throw new InvalidReportFilterError('Choose a period from the list.');
    const days = resolvePeriod(preset, today, params.from && params.to ? { from: params.from, to: params.to } : undefined);
    const { graceDays, expiringSoonDays, vipReviewNoticeDays } = (await this.settings.getSettings(tenantId)).toJSON();
    const query: ReportQuery = { tenantId, filters, days, window: instantsOf(days, timezone), today, graceDays, expiringSoonDays, vipReviewNoticeDays };

    const months = bucketsOf(days, 'MONTH')
      .slice(-24)
      .map((b) => ({ month: b.from.slice(0, 7), end: this.monthEnd(b.from, timezone, now) }));

    const [byTier, bySegment, monthly, created, payments, downs, terms, employers, expiring, vipReviews, former] = await Promise.all([
      this.reader.activeByTier(query),
      this.reader.activeBySegment(query),
      this.reader.activeAtMonthEnds(query, months),
      this.reader.newMembers(query),
      this.reader.paymentGroups(query),
      this.reader.downgrades(query),
      this.reader.renewalTerms(query),
      this.reader.employers(query),
      this.reader.workingList(query, 'EXPIRING'),
      this.reader.workingList(query, 'VIP_REVIEW'),
      this.reader.workingList(query, 'FORMER_EMPLOYEES'),
    ]);

    const canSeeMoney = access.can(MEMBERS_PAYMENTS_VIEW);
    const activeTotal = byTier.reduce((sum, r) => sum + r.count, 0);

    const renewalOf = (rows: typeof terms) => {
      const { due, renewed } = renewalFigures(rows, graceDays, { from: new Date(`${days.from}T00:00:00.000Z`), to: new Date(`${days.to}T00:00:00.000Z`) });
      return { due, renewed, notRenewed: due - renewed, rate: renewalRate(renewed, due)?.toString() ?? null };
    };
    const renewalTiers: Tier[] = ['SILVER', 'GOLD'];

    const upgradeGroups = payments.filter((g) => g.kind === 'UPGRADE');
    const upgradeAmount = upgradeGroups.reduce((sum, g) => sum.add(Money.of(g.total)), Money.zero());
    const down = downgradeCount(downs);

    const revenueGroups = new Map<string, RevenueRow>();
    for (const g of payments) {
      const key = `${g.kind}:${g.toTier}`;
      const row = revenueGroups.get(key) ?? { kind: g.kind, tier: g.toTier, count: 0, total: Money.zero() };
      revenueGroups.set(key, { ...row, count: row.count + g.count, total: row.total.add(Money.of(g.total)) });
    }
    const revenueRows = [...revenueGroups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || tierRank(a.tier) - tierRank(b.tier));
    const revenueTotal = totalRow(revenueRows);

    return {
      period: { preset, ...days },
      asOf: today,
      filters,
      active: {
        basis: 'asOfNow',
        total: activeTotal,
        perTier: TIERS.map((tier) => ({ tier, count: countOf(byTier, tier), share: share(countOf(byTier, tier), activeTotal) })),
        monthly: months.map(({ month }) => {
          const rows = monthly.filter((r) => r.month === month);
          return { month, total: rows.reduce((s, r) => s + r.count, 0), perTier: TIERS.map((tier) => ({ tier, count: countOf(rows, tier) })) };
        }),
      },
      segments: {
        basis: 'asOfNow',
        corporate: { count: bySegment.corporate, share: share(bySegment.corporate, bySegment.corporate + bySegment.individual) },
        individual: { count: bySegment.individual, share: share(bySegment.individual, bySegment.corporate + bySegment.individual) },
      },
      newMembers: {
        basis: 'period',
        total: created.corporate + created.individual,
        corporate: created.corporate,
        individual: created.individual,
        newPaidMemberships: payments.filter((g) => g.kind === 'NEW').reduce((s, g) => s + g.count, 0),
      },
      renewals: {
        basis: 'period',
        ...renewalOf(terms),
        perTier: renewalTiers.map((tier) => ({ tier, ...renewalOf(terms.filter((t) => t.tier === tier)) })),
      },
      upgrades: {
        basis: 'period',
        count: upgradeGroups.reduce((s, g) => s + g.count, 0),
        ...(canSeeMoney ? { amount: upgradeAmount.toString() } : {}),
        perPath: upgradeGroups
          .map((g) => ({ path: `${g.fromTier}>${g.toTier}`, count: g.count, ...(canSeeMoney ? { amount: Money.of(g.total).toString() } : {}) }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      },
      downgrades: {
        basis: 'period',
        total: down.total,
        perPath: Object.entries(down.byPath).map(([path, count]) => ({ path, count })).sort((a, b) => a.path.localeCompare(b.path)),
        perReason: Object.entries(down.byReason).map(([reason, count]) => ({ reason, count })).sort((a, b) => a.reason.localeCompare(b.reason)),
      },
      employers: {
        basis: 'asOfNow',
        rows: employers,
        totals: employers.reduce(
          (t, r) => ({
            members: t.members + r.members,
            sponsoredSilver: t.sponsoredSilver + r.sponsoredSilver,
            upgradedToPaid: t.upgradedToPaid + r.upgradedToPaid,
            formerEmployees: t.formerEmployees + r.formerEmployees,
          }),
          { members: 0, sponsoredSilver: 0, upgradedToPaid: 0, formerEmployees: 0 }
        ),
      },
      ...(canSeeMoney
        ? {
            revenue: {
              basis: 'period' as const,
              count: revenueTotal.count,
              total: revenueTotal.total.toString(),
              rows: revenueRows.map((r) => ({ kind: r.kind, tier: r.tier, count: r.count, total: r.total.toString() })),
            },
          }
        : {}),
      lists: { expiring, vipReviews, formerEmployees: former },
    };
  }

  /** The instant a month closes in the workspace, or now for the running month. */
  private monthEnd(firstDay: string, timezone: string, now: Date): Date {
    const first = new Date(`${firstDay}T00:00:00.000Z`);
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const end = instantsOf({ from: firstDay, to: lastDay }, timezone).end;
    return end < now ? end : now;
  }

  /** Locations only from the predefined lists, an employer only of this workspace (FR-RPT-01). */
  private async checkedFilters(tenantId: string, params: MembershipReportParams): Promise<ReportFilters> {
    const filters: ReportFilters = {
      ...(params.tier ? { tier: params.tier } : {}),
      ...(params.segment ? { segment: params.segment } : {}),
      ...(params.employerClientId ? { employerClientId: params.employerClientId } : {}),
      ...(params.areaId ? { areaId: params.areaId } : {}),
      ...(params.cityId ? { cityId: params.cityId } : {}),
    };
    if ((filters.areaId || filters.cityId) && !(await this.reader.locationIsPredefined(tenantId, filters))) {
      throw new InvalidReportFilterError('Choose an Area and City from the lists.');
    }
    if (filters.employerClientId && !(await this.reader.employerExists(tenantId, filters.employerClientId))) {
      throw new InvalidReportFilterError('Choose an employer company of this workspace.');
    }
    return filters;
  }
}
