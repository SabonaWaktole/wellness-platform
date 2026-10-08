import type { MembershipReport } from './GetMembershipReportUseCase';
import type { WorkingListRow } from './ports/IMembershipReportReader';

export const REPORT_NAMES = [
  'active',
  'monthly',
  'new',
  'renewals',
  'upgrades',
  'downgrades',
  'segments',
  'employers',
  'revenue',
  'expiring',
  'vip-reviews',
  'former-employees',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export interface ReportTable {
  header: string[];
  rows: Array<Array<string | number>>;
}

const dash = (value: string | null | undefined): string => value ?? '—';

const listTable = (rows: readonly WorkingListRow[], dateLabel: string, withContact: boolean): ReportTable => ({
  header: ['Member ID', 'First name', 'Last name', 'Tier', dateLabel, 'Employer', ...(withContact ? ['Phone', 'Email'] : [])],
  rows: rows.map((r) => [r.memberNumber, r.firstName, r.lastName, r.tier, dash(r.date), r.employer?.name ?? '', ...(withContact ? [r.phone ?? '', r.email ?? ''] : [])]),
});

/**
 * The table of each report, the one source of both the screen's table view and
 * the CSV file (FR-RPT-10), so the file is the table. Contact details only when
 * the viewer holds "Members: view"; revenue only when the report carries it.
 */
export function reportTable(report: MembershipReport, name: ReportName, options: { withContact: boolean }): ReportTable {
  switch (name) {
    case 'active':
      return {
        header: ['Tier', 'Active members', 'Share %'],
        rows: [...report.active.perTier.map((r) => [r.tier, r.count, dash(r.share)]), ['Total', report.active.total, '']],
      };
    case 'monthly':
      return {
        header: ['Month', 'Total', ...(report.active.monthly[0]?.perTier.map((t) => t.tier) ?? [])],
        rows: report.active.monthly.map((m) => [m.month, m.total, ...m.perTier.map((t) => t.count)]),
      };
    case 'new':
      return {
        header: ['Figure', 'Count'],
        rows: [
          ['New members', report.newMembers.total],
          ['Corporate', report.newMembers.corporate],
          ['Individual', report.newMembers.individual],
          ['New paid memberships', report.newMembers.newPaidMemberships],
        ],
      };
    case 'renewals':
      return {
        header: ['Tier', 'Renewals due', 'Renewed', 'Not renewed', 'Renewal rate %'],
        rows: [
          ...report.renewals.perTier.map((r) => [r.tier, r.due, r.renewed, r.notRenewed, dash(r.rate)]),
          ['Total', report.renewals.due, report.renewals.renewed, report.renewals.notRenewed, dash(report.renewals.rate)],
        ],
      };
    case 'upgrades':
      return {
        header: ['Path', 'Count', ...(report.upgrades.amount !== undefined ? ['Amount'] : [])],
        rows: [
          ...report.upgrades.perPath.map((r) => [r.path.replace('>', ' > '), r.count, ...(r.amount !== undefined ? [r.amount] : [])]),
          ['Total', report.upgrades.count, ...(report.upgrades.amount !== undefined ? [report.upgrades.amount] : [])],
        ],
      };
    case 'downgrades':
      return {
        header: ['By', 'Value', 'Count'],
        rows: [
          ...report.downgrades.perPath.map((r) => ['Path', r.path.replace('>', ' > '), r.count]),
          ...report.downgrades.perReason.map((r) => ['Reason', r.reason, r.count]),
          ['Total', '', report.downgrades.total],
        ],
      };
    case 'segments':
      return {
        header: ['Segment', 'Active members', 'Share %'],
        rows: [
          ['Corporate', report.segments.corporate.count, dash(report.segments.corporate.share)],
          ['Individual', report.segments.individual.count, dash(report.segments.individual.share)],
        ],
      };
    case 'employers':
      return {
        header: ['Company', 'Members', 'Sponsored Silver', 'Upgraded to paid', 'Former employees'],
        rows: [
          ...report.employers.rows.map((r) => [r.name ?? r.companyId, r.members, r.sponsoredSilver, r.upgradedToPaid, r.formerEmployees]),
          ['Total', report.employers.totals.members, report.employers.totals.sponsoredSilver, report.employers.totals.upgradedToPaid, report.employers.totals.formerEmployees],
        ],
      };
    case 'revenue':
      return {
        header: ['Kind', 'Tier', 'Count', 'Amount'],
        rows: [
          ...(report.revenue?.rows ?? []).map((r) => [r.kind, r.tier, r.count, r.total]),
          ...(report.revenue ? [['Total', '', report.revenue.count, report.revenue.total]] : []),
        ],
      };
    case 'expiring':
      return listTable(report.lists.expiring, 'Paid term ends', options.withContact);
    case 'vip-reviews':
      return listTable(report.lists.vipReviews, 'VIP review date', options.withContact);
    case 'former-employees':
      return listTable(report.lists.formerEmployees, 'Left company on', options.withContact);
  }
}
