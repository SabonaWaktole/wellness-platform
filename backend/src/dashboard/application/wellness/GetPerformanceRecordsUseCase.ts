import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { AccessContext } from '../../../access/domain/AccessContext';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { PeriodParams, performanceAudience, queryFor, resolveRequestedPeriod } from './performanceAudience';
import { IPerformanceReader, PerformanceIndicator } from './ports/IPerformanceReader';

export interface PerformanceRecordsParams extends PeriodParams {
  indicator: PerformanceIndicator;
  /** One salesperson, or every one the viewer may see. */
  salespersonId?: string;
  salespersonIds?: string[];
  page: number;
  limit: number;
}

/**
 * The activities, offers, deals or follow-ups behind one indicator of the Performance screen
 * (FR-PRF-07), under the same period, the same salespeople and the same scope as the figure, so
 * "Visits: 5" lists five visits. A salesperson outside the viewer's scope is refused (FR-RBAC-23).
 */
export class GetPerformanceRecordsUseCase {
  constructor(
    private readonly reader: IPerformanceReader,
    private readonly roster: ITeamRoster,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { tenantId: string; timezone: string; access: AccessContext; params: PerformanceRecordsParams }) {
    const { tenantId, timezone, access, params } = input;
    const requested = params.salespersonId ? [params.salespersonId] : params.salespersonIds;
    const { selected } = await performanceAudience(access, this.roster, tenantId, requested);
    const canSeeValue = access.can('commercial.view');
    if (params.indicator === 'TOTAL_VALUE' && !canSeeValue) {
      throw new PermissionDeniedError('commercial.view', 'You do not have permission to view values.');
    }

    const now = this.now();
    const period = resolveRequestedPeriod(params, now, timezone);
    const { rows, total } = await this.reader.records({
      ...queryFor(tenantId, timezone, now, selected, period),
      indicator: params.indicator,
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });
    const people = new Map((await this.reader.people(tenantId, [...new Set(rows.map((row) => row.salespersonId))])).map((person) => [person.id, person]));

    return {
      period: { from: period.days.from, to: period.days.to },
      indicator: params.indicator,
      rows: rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        at: row.at.toISOString(),
        clientId: row.clientId,
        companyName: row.companyName,
        salesperson: { id: row.salespersonId, name: people.get(row.salespersonId)?.name ?? row.salespersonId },
        label: row.label,
        detail: row.detail,
        dealId: row.dealId,
        ...(canSeeValue ? { annualValue: row.annualValue } : {}),
      })),
      count: total,
      page: params.page,
      limit: params.limit,
    };
  }
}
