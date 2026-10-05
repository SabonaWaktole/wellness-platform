import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { IContractSettingsStore } from '../../../contracts/application/ports/IContractSettingsStore';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { leadCount, lostAnalysis, OpenDeal, pipelineByStage, pipelineTotal } from '../../domain/DashboardDefinitions';
import { figuresOf, RawIndicators, totalRow } from '../../domain/KpiDefinitions';
import { checkedLocation, DashboardInput, dashboardAudience, dashboardWindow } from './dashboardContext';
import { ChartPoint, count, DashboardResponse, Figure, hasNothing, money, percent, periodOf } from './dashboardShape';
import { FollowUpCounts, IDashboardReader } from './ports/IDashboardReader';
import { IPerformanceReader, Salesperson } from './ports/IPerformanceReader';

const utcMidnight = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`);
const NO_FOLLOW_UPS: FollowUpCounts = { dueToday: 0, dueNext7Days: 0, overdue: 0 };
const OPEN_STAGES = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_PREPARED', 'OFFER_SENT', 'FOLLOW_UP', 'NEGOTIATION'];

/**
 * The Sales Manager's dashboard (FR-DSH-10): the team's leads, pipeline, offers, follow-ups, deals
 * won and lost, conversion rate, sales value and activity, in total and per salesperson, and the
 * lost-deal analysis by predefined reason. Should: pending discount approvals, contracts expiring soon
 * and overdue instalments of the team. The totals are worked out from the same per-salesperson counts
 * the rows show, so they always add up (FR-DSH-02), and cover the sales team only (D12).
 */
export class GetSalesManagerDashboardUseCase {
  constructor(
    private readonly indicators: IPerformanceReader,
    private readonly reader: IDashboardReader,
    private readonly roster: ITeamRoster,
    private readonly contractSettings: IContractSettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: DashboardInput): Promise<DashboardResponse> {
    const { tenantId, timezone, access, params } = input;
    const { allowed, selected } = await dashboardAudience('SALES_MANAGER', input, this.reader, this.roster);
    const location = await checkedLocation(this.reader, tenantId, params);
    const now = this.now();
    const { period, query, endOfToday, endOfNext7Days } = dashboardWindow(input, selected, location, now);
    const owners = { tenantId, salespersonIds: selected, location };
    const seeValue = access.can('commercial.view');
    const seePayments = access.can('payments.view');
    const seeContracts = access.can('contracts.validity.view');
    const seeFollowUps = access.can('calendar.view');

    const settings = seeContracts ? await this.contractSettings.get(tenantId) : null;
    const today = utcMidnight(dayKeyInZone(now, timezone));
    const [people, measured, deals, lost, reasons, followUps, expiring, overdue, approvals] = await Promise.all([
      this.indicators.people(tenantId, allowed),
      this.indicators.indicators(query),
      this.reader.openDeals(owners),
      this.reader.lostDeals(query),
      this.reader.lostReasons(tenantId),
      seeFollowUps ? this.reader.followUps({ ...owners, now, endOfToday, endOfNext7Days }) : null,
      settings ? this.reader.contractsExpiringSoon({ ...owners, today, windowDays: settings.expiringSoonDays }) : null,
      seePayments ? this.reader.overdueInstalments(owners) : null,
      seeValue ? this.reader.pendingDiscountApprovals(owners) : null,
    ]);

    const dealsOf = (id: string): OpenDeal[] => deals.filter((deal) => deal.ownerId === id);
    const followOf = (id: string) => followUps?.get(id) ?? NO_FOLLOW_UPS;
    const hasActivity = (id: string, raw: RawIndicators) =>
      raw.calls + raw.emails + raw.visits + raw.meetings + raw.offersCreated + raw.offersSent + raw.dealsWon + raw.dealsLost > 0 ||
      dealsOf(id).length > 0 ||
      followOf(id).overdue + followOf(id).dueToday + followOf(id).dueNext7Days > 0;

    // A salesperson deactivated later keeps a row only when there is something to show (FR-PRF-05).
    const byName = (a: Salesperson, b: Salesperson) => a.name.localeCompare(b.name);
    const shown = people
      .filter((person) => selected.includes(person.id) && (person.isActive || hasActivity(person.id, measured.perPerson.get(person.id)!)))
      .sort(byName);

    const rawOf = (id: string) => measured.perPerson.get(id)!;
    const sumFollow = (key: keyof FollowUpCounts) => shown.reduce((sum, person) => sum + followOf(person.id)[key], 0);
    const total = figuresOf(totalRow(shown.map((person) => rawOf(person.id)), 0));
    const teamDeals = deals.filter((deal) => shown.some((person) => person.id === deal.ownerId));
    const stages = pipelineByStage(teamDeals);
    const pipeline = pipelineTotal(stages);
    const sumOf = (map: Map<string, number> | null) => shown.reduce((sum, person) => sum + (map?.get(person.id) ?? 0), 0);

    const link = (extra: Record<string, string | string[]>) => ({ ...extra, ...(params.salespersonId ? { ownerUserId: params.salespersonId } : {}) });
    const figures: Figure[] = [
      count('leads', 'Leads', leadCount(teamDeals), 'asOfNow', { target: 'DEALS', filters: link({ stage: ['NEW_LEAD', 'CONTACTED'] }) }),
      count('activeDeals', 'Active deals', pipeline.count, 'asOfNow', { target: 'DEALS', filters: link({ stage: OPEN_STAGES }) }),
      ...(seeValue ? [money('pipelineValue', 'Pipeline value', pipeline.value, 'asOfNow')] : []),
      count('offersCreated', 'Offers created', total.offersCreated, 'period'),
      count('offersSent', 'Offers sent', total.offersSent, 'period'),
      ...(seeFollowUps
        ? [
            count('followUpsDueToday', 'Follow-ups due today', sumFollow('dueToday'), 'asOfNow'),
            count('followUpsDueNext7Days', 'Follow-ups due in the next 7 days', sumFollow('dueNext7Days'), 'asOfNow'),
            count('followUpsOverdue', 'Overdue follow-ups', sumFollow('overdue'), 'asOfNow', {
              target: 'FOLLOW_UPS',
              filters: { overdueOnly: 'true', ...(params.salespersonId ? { assignedUserId: params.salespersonId } : {}) },
            }),
          ]
        : []),
      count('dealsWon', 'Deals won', total.dealsWon, 'period'),
      count('dealsLost', 'Deals lost', total.dealsLost, 'period'),
      percent('conversionRate', 'Conversion rate', total.conversionRate, 'period'),
      ...(seeValue ? [money('salesValue', 'Sales value', total.totalValue, 'period')] : []),
      count('calls', 'Calls', total.calls, 'period'),
      count('emails', 'Emails', total.emails, 'period'),
      count('visits', 'Visits', total.visits, 'period'),
      count('meetings', 'Meetings', total.meetings, 'period'),
      ...(seeValue && approvals !== null ? [count('pendingDiscountApprovals', 'Pending discount approvals', approvals, 'asOfNow')] : []),
      ...(seeContracts
        ? [
            count('contractsExpiringSoon', 'Contracts expiring soon', sumOf(expiring), 'asOfNow', {
              target: 'RENEWALS',
              filters: { window: String(settings!.expiringSoonDays), ...(params.salespersonId ? { salespersonId: params.salespersonId } : {}) },
            }),
          ]
        : []),
      ...(seePayments
        ? [count('overdueInstalments', 'Overdue instalments', sumOf(overdue), 'asOfNow', { target: 'PAYMENTS', filters: { status: 'OVERDUE' } })]
        : []),
    ];

    const rows = shown.map((person) => {
      const figuresOfPerson = figuresOf(rawOf(person.id));
      const follow = followOf(person.id);
      return {
        salesperson: person,
        leads: leadCount(dealsOf(person.id)),
        activeDeals: dealsOf(person.id).length,
        ...(seeFollowUps ? { followUpsDueToday: follow.dueToday, followUpsDueNext7Days: follow.dueNext7Days, followUpsOverdue: follow.overdue } : {}),
        offersCreated: figuresOfPerson.offersCreated,
        offersSent: figuresOfPerson.offersSent,
        dealsWon: figuresOfPerson.dealsWon,
        dealsLost: figuresOfPerson.dealsLost,
        conversionRate: figuresOfPerson.conversionRate,
        ...(seeValue ? { salesValue: figuresOfPerson.totalValue.toString() } : {}),
        calls: figuresOfPerson.calls,
        emails: figuresOfPerson.emails,
        visits: figuresOfPerson.visits,
        meetings: figuresOfPerson.meetings,
      };
    });

    const pipelinePoints: ChartPoint[] = stages.map((stage) => ({
      key: stage.stage,
      label: stage.stage,
      count: stage.count,
      ...(seeValue ? { annualValue: stage.value.toString() } : {}),
    }));

    // The lost deals of the people shown, so the reasons add up to the team's lost deals.
    const shownIds = new Set(shown.map((person) => person.id));
    const names = new Map(reasons.map((reason) => [reason.id, reason]));
    const lostPoints = lostAnalysis(lost.filter((deal) => shownIds.has(deal.ownerId))).map((group): ChartPoint & { labelSq: string | null; labelEn: string | null } => ({
      key: group.reasonId ?? 'NO_REASON',
      label: group.reasonId ? names.get(group.reasonId)?.nameSq ?? group.reasonId : 'NO_REASON',
      labelSq: group.reasonId ? names.get(group.reasonId)?.nameSq ?? null : null,
      labelEn: group.reasonId ? names.get(group.reasonId)?.nameEn ?? null : null,
      count: group.count,
      ...(seeValue ? { annualValue: group.value.toString() } : {}),
    }));

    return {
      kind: 'SALES_MANAGER',
      period: periodOf(params.preset, period.days),
      calculatedAt: now.toISOString(),
      figures,
      tables: { perSalesperson: rows, lostReasons: lostPoints },
      charts: { pipeline: pipelinePoints, lostReasons: lostPoints },
      empty: hasNothing(figures),
    };
  }
}

