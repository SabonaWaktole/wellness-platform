import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { AccessContext } from '../../../access/domain/AccessContext';
import { figuresOf, PerformanceFigures, RawIndicators, totalRow } from '../../domain/KpiDefinitions';
import { PeriodParams, performanceAudience, queryFor, resolveRequestedPeriod } from './performanceAudience';
import { presentChange, presentFigures } from './presentPerformance';
import { IPerformanceReader, Salesperson } from './ports/IPerformanceReader';

export interface PerformanceParams extends PeriodParams {
  salespersonIds?: string[];
  /** Compare with the previous period (FR-PRF-06). */
  compare?: boolean;
}

export interface PerformanceRow {
  salesperson: Salesperson;
  figures: ReturnType<typeof presentFigures>;
  change?: ReturnType<typeof presentChange>;
}

export interface PerformanceResult {
  period: { from: string; to: string; previous?: { from: string; to: string } };
  rows: PerformanceRow[];
  /** Who the viewer can pick in the salesperson filter: the active ones, and any shown row (FR-PRF-02). */
  salespeople: Salesperson[];
  /** Calculated from the data of the selected salespeople (FR-PRF-04). Not sent to a viewer who sees only their own row. */
  total: Omit<PerformanceRow, 'salesperson'> | null;
  /** True for a Sales User: their own row only, no one else's (FR-PRF-01). */
  ownOnly: boolean;
}

const hasPeriodActivity = (raw: RawIndicators) =>
  raw.calls + raw.emails + raw.visits + raw.meetings + raw.offersCreated + raw.offersSent + raw.dealsWon + raw.dealsLost + raw.followUpsCompleted > 0;

/**
 * The Performance screen (FR-PRF-01 to 06, 10): one row per salesperson and a total row of the
 * fourteen indicators of SRS §6.2, for a period and a set of salespeople. Every formula is a pure
 * function in `KpiDefinitions`; this only chooses whose numbers and which days.
 */
export class GetPerformanceUseCase {
  constructor(
    private readonly reader: IPerformanceReader,
    private readonly roster: ITeamRoster,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { tenantId: string; timezone: string; access: AccessContext; params: PerformanceParams }): Promise<PerformanceResult> {
    const { tenantId, timezone, access, params } = input;
    const { allowed, selected, ownOnly } = await performanceAudience(access, this.roster, tenantId, params.salespersonIds);
    const now = this.now();
    const period = resolveRequestedPeriod(params, now, timezone);
    const canSeeValue = access.can('commercial.view');

    const [people, current, previous] = await Promise.all([
      this.reader.people(tenantId, allowed),
      this.reader.indicators(queryFor(tenantId, timezone, now, selected, period)),
      params.compare ? this.reader.indicators(queryFor(tenantId, timezone, now, selected, period.previous)) : Promise.resolve(null),
    ]);

    // A salesperson deactivated later keeps their row only if they were active in the period (FR-PRF-05).
    const byName = (a: Salesperson, b: Salesperson) => a.name.localeCompare(b.name);
    const inSelection = people.filter((person) => selected.includes(person.id));
    const shown = inSelection.filter((person) => person.isActive || hasPeriodActivity(current.perPerson.get(person.id)!)).sort(byName);
    const shownIds = new Set(shown.map((person) => person.id));
    const salespeople = people.filter((person) => person.isActive || shownIds.has(person.id)).sort(byName);

    const rowOf = (raw: RawIndicators, before: RawIndicators | null): Omit<PerformanceRow, 'salesperson'> => {
      const figures: PerformanceFigures = figuresOf(raw);
      return {
        figures: presentFigures(figures, canSeeValue),
        ...(before ? { change: presentChange(figures, figuresOf(before), canSeeValue) } : {}),
      };
    };

    const rows = shown.map((salesperson) => ({
      salesperson,
      ...rowOf(current.perPerson.get(salesperson.id)!, previous?.perPerson.get(salesperson.id) ?? null),
    }));

    // The total covers the people the screen shows, from their underlying counts and sums. Companies
    // cannot be added across people, so the reader counted them across everyone selected; a person left
    // out has no contact in the period, so that count is the same for the people shown.
    const totalOf = (result: typeof current) =>
      totalRow(
        shown.map((person) => result.perPerson.get(person.id)!),
        result.companiesContacted
      );
    const total = ownOnly ? null : rowOf(totalOf(current), previous ? totalOf(previous) : null);

    return {
      period: {
        from: period.days.from,
        to: period.days.to,
        ...(params.compare ? { previous: { from: period.previous.days.from, to: period.previous.days.to } } : {}),
      },
      rows,
      salespeople,
      total,
      ownOnly,
    };
  }
}
