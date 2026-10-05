import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { AccessContext } from '../../../access/domain/AccessContext';
import { figuresOf } from '../../domain/KpiDefinitions';
import { bucketsOf, InvalidPeriodError, instantsOf } from '../../domain/PerformancePeriod';
import { PeriodParams, performanceAudience, queryFor, resolveRequestedPeriod } from './performanceAudience';
import { presentFigures } from './presentPerformance';
import { IPerformanceReader } from './ports/IPerformanceReader';

export const MAX_SERIES_BUCKETS = 60;

export interface PerformanceSeriesParams extends PeriodParams {
  salespersonId: string;
  grain: 'WEEK' | 'MONTH';
}

/**
 * One salesperson's indicators per week or per month (FR-PRF-08), each bucket read exactly like
 * a period of the main screen, so the chart and the table behind it show the same numbers.
 * Overdue follow-ups are as of now, not by period, so a bucket does not carry them.
 */
export class GetPerformanceSeriesUseCase {
  constructor(
    private readonly reader: IPerformanceReader,
    private readonly roster: ITeamRoster,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { tenantId: string; timezone: string; access: AccessContext; params: PerformanceSeriesParams }) {
    const { tenantId, timezone, access, params } = input;
    const { selected } = await performanceAudience(access, this.roster, tenantId, [params.salespersonId]);
    const canSeeValue = access.can('commercial.view');
    const now = this.now();
    const period = resolveRequestedPeriod(params, now, timezone);
    const buckets = bucketsOf(period.days, params.grain);
    if (buckets.length > MAX_SERIES_BUCKETS) {
      throw new InvalidPeriodError(`Choose a shorter period: at most ${MAX_SERIES_BUCKETS} ${params.grain === 'WEEK' ? 'weeks' : 'months'}.`);
    }

    const [person] = await this.reader.people(tenantId, selected);
    const points = await Promise.all(
      buckets.map(async (days) => {
        const result = await this.reader.indicators(queryFor(tenantId, timezone, now, selected, { days, window: instantsOf(days, timezone) }));
        const { followUpsOverdue: _asOfNow, ...figures } = presentFigures(figuresOf(result.perPerson.get(params.salespersonId)!), canSeeValue) as ReturnType<typeof presentFigures> & {
          followUpsOverdue: number;
        };
        return { from: days.from, to: days.to, figures };
      })
    );
    return { salesperson: person ?? null, grain: params.grain, period: { from: period.days.from, to: period.days.to }, points };
  }
}
