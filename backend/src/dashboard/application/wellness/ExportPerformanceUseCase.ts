import { IAuditTrail } from '../../../audit/application/ports/IAuditTrail';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { AccessContext } from '../../../access/domain/AccessContext';
import { GetPerformanceUseCase, PerformanceParams } from './GetPerformanceUseCase';

/**
 * The Performance table as a CSV or a PDF (FR-PRF-09). It is the same query as the screen, with the
 * viewer's scope and the same value rule, so the file has the same rows and filters. The audit entry
 * (who, when and the filters used, FR-AUD-13) is written before anything is handed over: an export
 * that happened is always on record, and one that cannot be recorded does not happen.
 */
export class ExportPerformanceUseCase {
  constructor(
    private readonly performance: GetPerformanceUseCase,
    private readonly audit: IAuditTrail
  ) {}

  async execute(input: { tenantId: string; timezone: string; access: AccessContext; actingUserId: string; params: PerformanceParams; format: 'CSV' | 'PDF' }) {
    const { tenantId, access, params } = input;
    const result = await this.performance.execute({ tenantId, timezone: input.timezone, access, params });

    await this.audit.record({
      tenantId,
      userId: input.actingUserId,
      userRole: access.auditRole,
      action: AuditAction.Export,
      entityType: 'Performance',
      entityId: 'export',
      entityLabel: 'Performance export',
      changes: [
        { field: 'format', old: null, new: input.format },
        { field: 'rows', old: null, new: result.rows.length },
        { field: 'filter.period', old: null, new: `${result.period.from}..${result.period.to}` },
        { field: 'filter.preset', old: null, new: params.preset },
        ...(params.salespersonIds?.length ? [{ field: 'filter.salespersonIds', old: null, new: params.salespersonIds.join(',') }] : []),
        ...(params.compare ? [{ field: 'filter.compare', old: null, new: true }] : []),
      ],
    });
    return result;
  }
}
