import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { IReportRepository, NewClientsPoint } from '../../domain/IReportRepository';

/** Bounds on the requested window, so a caller cannot ask for a decade of buckets. */
const MIN_MONTHS = 1;
const MAX_MONTHS = 36;
const DEFAULT_MONTHS = 12;

/**
 * New clients over time (§6.7, "basic trend view of new clients added over a
 * selected period, shown as a simple graph").
 *
 * A separate use case from `GetClientReportUseCase` rather than an extra field
 * on it: that one answers "what does the client base look like now" and takes
 * no parameters, this one answers "how did it get there" and takes a window.
 * Merging them would give the status donut a period filter it has no meaning
 * for.
 */
export class GetClientTrendUseCase {
  constructor(
    private readonly reportRepository: IReportRepository,
    private readonly scopes: RecordScopeResolver
  ) {}

  /** Counted over the companies in the viewer's `companies.view` scope (FR-RBAC-13). */
  async execute(tenantId: string, months: number | undefined, access: AccessContext): Promise<NewClientsPoint[]> {
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Clamped rather than rejected: an out-of-range window is a UI mistake, not
    // a reason to show the owner an error instead of their growth chart.
    const clamped = Math.min(Math.max(Math.floor(months ?? DEFAULT_MONTHS) || DEFAULT_MONTHS, MIN_MONTHS), MAX_MONTHS);

    const scope = await this.scopes.resolve(access, 'companies.view');
    return this.reportRepository.getNewClientsTrend(tenantId, clamped, scope);
  }
}
