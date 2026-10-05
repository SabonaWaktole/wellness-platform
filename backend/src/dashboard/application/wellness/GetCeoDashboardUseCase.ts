import { ITeamRoster } from '../../../access/application/ports/ITeamRoster';
import { ALL_RECORDS } from '../../../access/domain/RecordScope';
import { IContractSettingsStore } from '../../../contracts/application/ports/IContractSettingsStore';
import { IPaymentOverviewReader } from '../../../contracts/application/ports/IPaymentOverviewReader';
import { PaymentStatus } from '../../../contracts/domain/ContractPayment';
import { Money } from '../../../pricing/domain/Money';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { leadCount, pipelineByStage, pipelineTotal } from '../../domain/DashboardDefinitions';
import { salesByRange } from '../../domain/ExecutiveDefinitions';
import { bucketsOf, InvalidPeriodError } from '../../domain/PerformancePeriod';
import { DashboardInput, ensureDashboardKind, refuseNarrowing } from './dashboardContext';
import { ChartPoint, count, DashboardResponse, Figure, hasNothing, money, periodOf } from './dashboardShape';
import { GetPerformanceUseCase } from './GetPerformanceUseCase';
import { MAX_SERIES_BUCKETS } from './GetPerformanceSeriesUseCase';
import { queryFor, resolveRequestedPeriod } from './performanceAudience';
import { ICeoDashboardReader } from './ports/ICeoDashboardReader';
import { IDashboardReader } from './ports/IDashboardReader';
import { IPerformanceReader } from './ports/IPerformanceReader';

const utcMidnight = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`);
const OPEN_STAGES = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_PREPARED', 'OFFER_SENT', 'FOLLOW_UP', 'NEGOTIATION'];

/** The Wellness+ indicators have a place in the response and nothing in it until Milestone 4 (FR-DSH-12). */
export type WellnessPlusSlot = never[];

export interface CeoDashboardResponse extends DashboardResponse {
  wellnessPlus: WellnessPlusSlot;
}

/**
 * The CEO's dashboard (FR-DSH-12): the whole workspace, read only. Sales figures come from the same
 * definitions as the other dashboards, the team table is the Performance screen's own rows, and the contract
 * and payment figures are counted with the conditions of their lists so the two agree. Money received is read
 * from the instalment history (Q10), so a reversal nets out. A figure the viewer may not see is absent, not
 * zero (FR-DSH-08).
 */
export class GetCeoDashboardUseCase {
  constructor(
    private readonly indicators: IPerformanceReader,
    private readonly reader: IDashboardReader,
    private readonly ceo: ICeoDashboardReader,
    private readonly payments: IPaymentOverviewReader,
    private readonly performance: GetPerformanceUseCase,
    private readonly roster: ITeamRoster,
    private readonly contractSettings: IContractSettingsStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: DashboardInput): Promise<CeoDashboardResponse> {
    const { tenantId, timezone, access, params } = input;
    await ensureDashboardKind('CEO', this.reader, access, tenantId);
    refuseNarrowing(params);
    const now = this.now();
    const period = resolveRequestedPeriod(params, now, timezone);
    const buckets = bucketsOf(period.days, 'MONTH');
    if (buckets.length > MAX_SERIES_BUCKETS) throw new InvalidPeriodError(`Choose a shorter period: at most ${MAX_SERIES_BUCKETS} months.`);

    const seeValue = access.can('commercial.view');
    const seePayments = access.can('payments.view');
    const seeContracts = access.can('contracts.validity.view');
    const seeFollowUps = access.can('calendar.view');
    const seeDeals = access.can('deals.view');
    const seeCompanies = access.can('companies.view');
    const today = utcMidnight(dayKeyInZone(now, timezone));
    const settings = seeContracts ? await this.contractSettings.get(tenantId) : null;
    const salespeople = await this.roster.salesUserIds(tenantId);
    const periodParams = { preset: params.preset, ...(params.from && params.to ? { from: params.from, to: params.to } : {}) };
    const paymentFilters = { tenantId, scope: ALL_RECORDS, today };

    const [team, wins, deals, revenue, recurring, contracts, overdueFollowUps, approvals, offersWaiting, companies, byStatus, allPayments] = await Promise.all([
      this.performance.execute({ tenantId, timezone, access, params: periodParams }),
      // One read of the whole period, cut into months in memory: the series needs only the deals won.
      this.indicators.wonDeals(queryFor(tenantId, timezone, now, salespeople, period)),
      seeDeals ? this.ceo.openDeals(tenantId) : null,
      seePayments && seeValue ? this.ceo.revenue({ tenantId, days: period.days, window: period.window }) : null,
      seeContracts && seeValue ? this.ceo.monthlyRecurringValue({ tenantId, today }) : null,
      settings ? this.ceo.contracts({ tenantId, today, expiringSoonDays: settings.expiringSoonDays }) : null,
      seeFollowUps ? this.ceo.overdueFollowUps({ tenantId, now }) : null,
      seeValue ? this.ceo.pendingDiscountApprovals(tenantId) : null,
      seeDeals ? this.ceo.offersWaiting(tenantId) : null,
      seeCompanies ? this.ceo.companiesPerStatus(tenantId) : null,
      seePayments
        ? Promise.all(Object.values(PaymentStatus).map(async (status) => ({ status, ...(await this.payments.search({ ...paymentFilters, status }, { page: 1, limit: 1 })) })))
        : null,
      seePayments ? this.payments.search(paymentFilters, { page: 1, limit: 1 }) : null,
    ]);

    const stages = pipelineByStage(deals ?? []);
    const pipeline = pipelineTotal(stages);
    const salesValue = team.total?.figures && 'totalValue' in team.total.figures ? Money.of(team.total.figures.totalValue as string) : null;
    const overduePayments = byStatus?.find((row) => row.status === PaymentStatus.Overdue) ?? null;

    const figures: Figure[] = [
      ...(deals
        ? [
            count('leads', 'Leads', leadCount(deals), 'asOfNow', { target: 'DEALS', filters: { stage: ['NEW_LEAD', 'CONTACTED'] } }),
            count('activeDeals', 'Active deals', pipeline.count, 'asOfNow', { target: 'DEALS', filters: { stage: OPEN_STAGES } }),
            ...(seeValue ? [money('pipelineValue', 'Pipeline value', pipeline.value, 'asOfNow')] : []),
          ]
        : []),
      ...(salesValue ? [money('salesValue', 'Sales value', salesValue, 'period')] : []),
      ...(revenue ? [money('revenue', 'Revenue', revenue, 'period')] : []),
      ...(recurring ? [money('monthlyRecurringValue', 'Monthly recurring value', recurring, 'asOfNow')] : []),
      ...(contracts
        ? [
            count('contractsActive', 'Active contracts', contracts.active.count, 'asOfNow'),
            count('contractsExpired', 'Expired contracts', contracts.expired.count, 'asOfNow'),
            count('contractsExpiringSoon', 'Contracts expiring soon', contracts.expiringSoon.count, 'asOfNow', {
              target: 'RENEWALS',
              filters: { window: String(settings!.expiringSoonDays) },
            }),
          ]
        : []),
      ...(allPayments && seeValue ? [money('paymentsOutstanding', 'Outstanding payments', allPayments.totals.outstanding, 'asOfNow', { target: 'PAYMENTS', filters: {} })] : []),
      ...(overduePayments
        ? [
            count('paymentsOverdue', 'Overdue instalments', overduePayments.total, 'asOfNow', { target: 'PAYMENTS', filters: { status: 'OVERDUE' } }),
            ...(seeValue ? [money('paymentsOverdueAmount', 'Overdue amount', overduePayments.totals.outstanding, 'asOfNow', { target: 'PAYMENTS', filters: { status: 'OVERDUE' } })] : []),
          ]
        : []),
      ...(overdueFollowUps !== null
        ? [count('followUpsOverdue', 'Overdue follow-ups', overdueFollowUps, 'asOfNow', { target: 'FOLLOW_UPS', filters: { overdueOnly: 'true' } })]
        : []),
      ...(approvals !== null ? [count('pendingDiscountApprovals', 'Pending discount approvals', approvals, 'asOfNow')] : []),
      ...(offersWaiting !== null ? [count('offersWaiting', 'Offers waiting', offersWaiting, 'asOfNow', { target: 'OFFERS', filters: { status: 'SENT' } })] : []),
    ];

    const pipelinePoints: ChartPoint[] = stages.map((stage) => ({
      key: stage.stage,
      label: stage.stage,
      count: stage.count,
      ...(seeValue ? { annualValue: stage.value.toString() } : {}),
    }));
    // One point per calendar month of the period: deals won, with the sales value of those deals.
    const monthPoints: ChartPoint[] = salesByRange(wins, buckets).map((month) => ({
      key: month.range.from.slice(0, 7),
      label: month.range.from.slice(0, 7),
      count: month.dealsWon,
      ...(seeValue ? { annualValue: month.salesValue.toString() } : {}),
    }));
    const companyPoints: ChartPoint[] = (companies ?? []).map((row) => ({ key: row.status ?? 'NONE', label: row.status ?? 'NONE', count: row.count }));

    const contractRows = contracts
      ? (['active', 'expired', 'expiringSoon'] as const).map((key) => ({
          key,
          count: contracts[key].count,
          ...(seeValue ? { annualValue: contracts[key].annualValue.toString() } : {}),
        }))
      : [];
    const paymentRows = (byStatus ?? []).map((row) => ({
      status: row.status,
      count: row.total,
      ...(seeValue ? { amount: row.totals.amount.toString(), paidAmount: row.totals.received.toString(), outstanding: row.totals.outstanding.toString() } : {}),
    }));

    return {
      kind: 'CEO',
      period: periodOf(params.preset, period.days),
      calculatedAt: now.toISOString(),
      figures,
      tables: { team: team.rows, contracts: contractRows, payments: paymentRows, companiesPerStatus: companyPoints },
      charts: { pipeline: pipelinePoints, salesPerMonth: monthPoints, companiesPerStatus: companyPoints },
      empty: hasNothing(figures),
      wellnessPlus: [],
    };
  }
}
