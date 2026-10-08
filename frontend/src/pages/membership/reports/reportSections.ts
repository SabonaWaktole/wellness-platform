import type { TFunction } from 'i18next';
import type { MembershipReport, ReportName } from '../../../services/membershipReportService';

export interface ReportBar {
  label: string;
  value: number;
}

/** One report on the page: the table the server's figures make, and the bars drawn from the same rows (FR-RPT-10). */
export interface ReportSection {
  name: ReportName;
  title: string;
  header: string[];
  rows: string[][];
  bars?: ReportBar[];
}

interface Writers {
  t: TFunction;
  number: (value: number) => string;
  /** A percent the server worked out, or a dash when there was nothing to divide. */
  percent: (value: string | null) => string;
  money: (value: string) => string;
  tier: (tier: string) => string;
  path: (path: string) => string;
}

/**
 * The chart-and-table sections, written from the report the server calculated. Nothing is added up here:
 * totals are the server's, and a rate with nothing to divide arrives as null and is shown as a dash.
 */
export function buildSections(report: MembershipReport, w: Writers): ReportSection[] {
  const { t, number: n, percent: p, money: m, tier, path } = w;
  const sections: ReportSection[] = [
    {
      name: 'active',
      title: t('reports.sections.active'),
      header: [t('reports.columns.tier'), t('reports.columns.count'), t('reports.columns.share')],
      rows: [...report.active.perTier.map((r) => [tier(r.tier), n(r.count), p(r.share)]), [t('reports.total'), n(report.active.total), '']],
      bars: report.active.perTier.map((r) => ({ label: tier(r.tier), value: r.count })),
    },
    {
      name: 'monthly',
      title: t('reports.sections.monthly'),
      header: [t('reports.columns.month'), t('reports.columns.total'), ...(report.active.monthly[0]?.perTier.map((r) => tier(r.tier)) ?? [])],
      rows: report.active.monthly.map((row) => [row.month, n(row.total), ...row.perTier.map((r) => n(r.count))]),
      bars: report.active.monthly.map((row) => ({ label: row.month, value: row.total })),
    },
    {
      name: 'segments',
      title: t('reports.sections.segments'),
      header: [t('reports.columns.segment'), t('reports.columns.count'), t('reports.columns.share')],
      rows: [
        [t('reports.segment.CORPORATE'), n(report.segments.corporate.count), p(report.segments.corporate.share)],
        [t('reports.segment.INDIVIDUAL'), n(report.segments.individual.count), p(report.segments.individual.share)],
      ],
      bars: [
        { label: t('reports.segment.CORPORATE'), value: report.segments.corporate.count },
        { label: t('reports.segment.INDIVIDUAL'), value: report.segments.individual.count },
      ],
    },
    {
      name: 'new',
      title: t('reports.sections.new'),
      header: [t('reports.columns.figure'), t('reports.columns.count')],
      rows: [
        [t('reports.figures.newMembers'), n(report.newMembers.total)],
        [t('reports.segment.CORPORATE'), n(report.newMembers.corporate)],
        [t('reports.segment.INDIVIDUAL'), n(report.newMembers.individual)],
        [t('reports.figures.newPaid'), n(report.newMembers.newPaidMemberships)],
      ],
      bars: [
        { label: t('reports.segment.CORPORATE'), value: report.newMembers.corporate },
        { label: t('reports.segment.INDIVIDUAL'), value: report.newMembers.individual },
        { label: t('reports.figures.newPaid'), value: report.newMembers.newPaidMemberships },
      ],
    },
    {
      name: 'renewals',
      title: t('reports.sections.renewals'),
      header: [t('reports.columns.tier'), t('reports.columns.due'), t('reports.columns.renewed'), t('reports.columns.notRenewed'), t('reports.columns.rate')],
      rows: [
        ...report.renewals.perTier.map((r) => [tier(r.tier), n(r.due), n(r.renewed), n(r.notRenewed), p(r.rate)]),
        [t('reports.total'), n(report.renewals.due), n(report.renewals.renewed), n(report.renewals.notRenewed), p(report.renewals.rate)],
      ],
      bars: [
        { label: t('reports.columns.renewed'), value: report.renewals.renewed },
        { label: t('reports.columns.notRenewed'), value: report.renewals.notRenewed },
      ],
    },
    {
      name: 'upgrades',
      title: t('reports.sections.upgrades'),
      header: [t('reports.columns.path'), t('reports.columns.count'), ...(report.upgrades.amount !== undefined ? [t('reports.columns.amount')] : [])],
      rows: [
        ...report.upgrades.perPath.map((r) => [path(r.path), n(r.count), ...(r.amount !== undefined ? [m(r.amount)] : [])]),
        [t('reports.total'), n(report.upgrades.count), ...(report.upgrades.amount !== undefined ? [m(report.upgrades.amount)] : [])],
      ],
      bars: report.upgrades.perPath.map((r) => ({ label: path(r.path), value: r.count })),
    },
    {
      name: 'downgrades',
      title: t('reports.sections.downgrades'),
      header: [t('reports.columns.by'), t('reports.columns.value'), t('reports.columns.count')],
      rows: [
        ...report.downgrades.perPath.map((r) => [t('reports.by.path'), path(r.path), n(r.count)]),
        ...report.downgrades.perReason.map((r) => [t('reports.by.reason'), t(`reports.reason.${r.reason}`, { defaultValue: r.reason }), n(r.count)]),
        [t('reports.total'), '', n(report.downgrades.total)],
      ],
      bars: report.downgrades.perReason.map((r) => ({ label: t(`reports.reason.${r.reason}`, { defaultValue: r.reason }), value: r.count })),
    },
    {
      name: 'employers',
      title: t('reports.sections.employers'),
      header: [t('reports.columns.company'), t('reports.columns.members'), t('reports.columns.sponsored'), t('reports.columns.upgraded'), t('reports.columns.former')],
      rows: [
        ...report.employers.rows.map((r) => [r.name ?? r.companyId, n(r.members), n(r.sponsoredSilver), n(r.upgradedToPaid), n(r.formerEmployees)]),
        [t('reports.total'), n(report.employers.totals.members), n(report.employers.totals.sponsoredSilver), n(report.employers.totals.upgradedToPaid), n(report.employers.totals.formerEmployees)],
      ],
    },
  ];
  if (report.revenue) {
    const { revenue } = report;
    sections.push({
      name: 'revenue',
      title: t('reports.sections.revenue'),
      header: [t('reports.columns.kind'), t('reports.columns.tier'), t('reports.columns.count'), t('reports.columns.amount')],
      rows: [
        ...revenue.rows.map((r) => [t(`payments.kind.${r.kind}`, { defaultValue: r.kind }), tier(r.tier), n(r.count), m(r.total)]),
        [t('reports.total'), '', n(revenue.count), m(revenue.total)],
      ],
      bars: revenue.rows.map((r) => ({ label: `${t(`payments.kind.${r.kind}`, { defaultValue: r.kind })} · ${tier(r.tier)}`, value: Number(r.total) })),
    });
  }
  return sections;
}
