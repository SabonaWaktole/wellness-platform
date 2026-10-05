import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { leadCount, pipelineByStage, pipelineTotal } from '../../domain/DashboardDefinitions';
import { figuresOf } from '../../domain/KpiDefinitions';
import { IContractSettingsStore } from '../../../contracts/application/ports/IContractSettingsStore';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { checkedLocation, DashboardInput, dashboardAudience, dashboardWindow } from './dashboardContext';
import { ChartPoint, count, DashboardResponse, Figure, hasNothing, money, periodOf } from './dashboardShape';
import { IDashboardReader } from './ports/IDashboardReader';
import { IPerformanceReader } from './ports/IPerformanceReader';

const utcMidnight = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`);

/**
 * The Sales User's dashboard (FR-DSH-09): their own leads, active deals with a count per stage,
 * follow-ups due and overdue, offers, deals won, sales value and activity, plus (Should) their own
 * contracts expiring soon and overdue instalments. Every figure is worked out when asked, from the
 * definitions in `KpiDefinitions` and `DashboardDefinitions`. A figure the viewer may not see is
 * absent, not zero (FR-DSH-08).
 */
export class GetSalesUserDashboardUseCase {
  constructor(
    private readonly indicators: IPerformanceReader,
    private readonly reader: IDashboardReader,
    private readonly roster: ITeamRoster,
    private readonly contractSettings: IContractSettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: DashboardInput): Promise<DashboardResponse> {
    const { tenantId, timezone, access, params } = input;
    const { selected } = await dashboardAudience('SALES_USER', input, this.reader, this.roster);
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
    const [measured, deals, followUps, expiring, overdue] = await Promise.all([
      this.indicators.indicators(query),
      this.reader.openDeals(owners),
      seeFollowUps ? this.reader.followUps({ ...owners, now, endOfToday, endOfNext7Days }) : null,
      settings ? this.reader.contractsExpiringSoon({ ...owners, today, windowDays: settings.expiringSoonDays }) : null,
      seePayments ? this.reader.overdueInstalments(owners) : null,
    ]);

    const me = access.userId;
    const mine = figuresOf(measured.perPerson.get(me)!);
    const stages = pipelineByStage(deals);
    const total = pipelineTotal(stages);
    const sum = (map: Map<string, number> | null) => [...(map?.values() ?? [])].reduce((a, b) => a + b, 0);
    const follow = followUps?.get(me) ?? { dueToday: 0, dueNext7Days: 0, overdue: 0 };

    const allStages = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_PREPARED', 'OFFER_SENT', 'FOLLOW_UP', 'NEGOTIATION'];
    const dealsLink = (stage: string[]) => ({ target: 'DEALS' as const, filters: { stage, ownerUserId: me } });

    const figures: Figure[] = [
      count('leads', 'Leads', leadCount(deals), 'asOfNow', dealsLink(['NEW_LEAD', 'CONTACTED'])),
      count('activeDeals', 'Active deals', total.count, 'asOfNow', dealsLink(allStages)),
      ...(seeValue ? [money('pipelineValue', 'Pipeline value', total.value, 'asOfNow')] : []),
      ...(seeFollowUps
        ? [
            count('followUpsDueToday', 'Follow-ups due today', follow.dueToday, 'asOfNow'),
            count('followUpsDueNext7Days', 'Follow-ups due in the next 7 days', follow.dueNext7Days, 'asOfNow'),
            count('followUpsOverdue', 'Overdue follow-ups', follow.overdue, 'asOfNow', {
              target: 'FOLLOW_UPS',
              filters: { overdueOnly: 'true', assignedUserId: me },
            }),
          ]
        : []),
      count('offersCreated', 'Offers created', mine.offersCreated, 'period'),
      count('offersSent', 'Offers sent', mine.offersSent, 'period'),
      count('dealsWon', 'Deals won', mine.dealsWon, 'period'),
      ...(seeValue ? [money('salesValue', 'Sales value', mine.totalValue, 'period')] : []),
      count('calls', 'Calls', mine.calls, 'period'),
      count('emails', 'Emails', mine.emails, 'period'),
      count('visits', 'Visits', mine.visits, 'period'),
      count('meetings', 'Meetings', mine.meetings, 'period'),
      ...(seeContracts
        ? [
            count('contractsExpiringSoon', 'Contracts expiring soon', sum(expiring), 'asOfNow', {
              target: 'RENEWALS',
              filters: { window: String(settings!.expiringSoonDays), salespersonId: me },
            }),
          ]
        : []),
      ...(seePayments
        ? [count('overdueInstalments', 'Overdue instalments', sum(overdue), 'asOfNow', { target: 'PAYMENTS', filters: { status: 'OVERDUE' } })]
        : []),
    ];

    const points: ChartPoint[] = stages.map((stage) => ({
      key: stage.stage,
      label: stage.stage,
      count: stage.count,
      ...(seeValue ? { annualValue: stage.value.toString() } : {}),
    }));

    return {
      kind: 'SALES_USER',
      period: periodOf(params.preset, period.days),
      calculatedAt: now.toISOString(),
      figures,
      tables: { dealsByStage: points },
      charts: { pipeline: points },
      empty: hasNothing(figures),
    };
  }
}

