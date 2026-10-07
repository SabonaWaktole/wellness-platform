import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';
import { MEMBERS_VIEW } from '../membershipPermissions';
import type { GetMembershipReportUseCase, MembershipReportParams } from './GetMembershipReportUseCase';
import { type ReportName, reportTable, type ReportTable } from './membershipReportTables';

/**
 * One report as a table for the CSV (FR-RPT-10). It is the same query as the
 * screen, with the same scope and the same revenue rule, so the file is the
 * table. The audit entry (who, when, which report, the filters, FR-AUD-16) is
 * written before the file is handed over, on the connection of the write
 * transaction: an export that happened is on record, and one that cannot be
 * recorded does not happen. Opening a report is not audited.
 */
export class ExportMembershipReportUseCase {
  constructor(
    private readonly report: GetMembershipReportUseCase,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; params: MembershipReportParams; name: ReportName }): Promise<ReportTable> {
    const { access, tenantId, params, name } = input;
    const report = await this.report.execute({ access, tenantId, timezone: input.timezone, params });
    const table = reportTable(report, name, { withContact: access.can(MEMBERS_VIEW) });
    await this.writeTx.run(({ auditTrail }) =>
      auditTrail.record({
        tenantId,
        userId: access.userId,
        userRole: access.auditRole,
        action: AuditAction.Export,
        entityType: 'MembershipReport',
        entityId: name,
        entityLabel: `Wellness+ report export: ${name}`,
        changes: [
          { field: 'format', old: null, new: 'CSV' },
          { field: 'report', old: null, new: name },
          { field: 'rows', old: null, new: table.rows.length },
          { field: 'filter.period', old: null, new: `${report.period.from}..${report.period.to}` },
          { field: 'filter.preset', old: null, new: report.period.preset },
          ...Object.entries(report.filters).map(([key, value]) => ({ field: `filter.${key}`, old: null, new: String(value) })),
        ],
      })
    );
    return table;
  }
}
